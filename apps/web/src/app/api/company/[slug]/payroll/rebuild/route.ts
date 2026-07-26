import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { resolveAutomationAccess } from "@/features/automation/server/automation.repository";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const body = await req.json();

    const startDate = body?.startDate;
    const endDate = body?.endDate;

    if (!startDate || !endDate) {
      return NextResponse.json({ error: "startDate and endDate required" }, { status: 400 });
    }

    const supabase = await getSupabaseServerClient();
    const access = await resolveAutomationAccess(supabase, slug);

    if (!access.allowed) {
      return NextResponse.json(
        { error: access.error ?? "Forbidden." },
        { status: access.status }
      );
    }

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id")
      .eq("company_slug", slug)
      .single();

    if (companyError || !company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const admin = createSupabaseServiceRoleClient();
    const { data, error } = await admin.rpc("rebuild_payroll_activity_fact", {
      p_company_id: company.id,
      p_start_date: startDate,
      p_end_date: endDate,
    });

    if (error) {
      const message = String(error.message ?? "");

      if (
        message.includes("daily_pay_eligible") &&
        message.includes("not-null constraint")
      ) {
        return NextResponse.json(
          {
            error:
              "Payroll rebuild blocked. One or more workers have a daily pay rate but no effective date. Open People → Roster, add the Daily Pay Effective Date, then run Rebuild again.",
            error_code: "PAYROLL_DAILY_PAY_EFFECTIVE_DATE_REQUIRED",
          },
          { status: 422 }
        );
      }

      return NextResponse.json(
        {
          error:
            "Payroll rebuild failed. Review the payroll configuration and source data, then try again.",
          detail: message,
        },
        { status: 500 }
      );
    }

    await admin.from("data_rebuild_log").insert({
      company_id: company.id,
      rebuild_type: "PAYROLL_ACTIVITY",
      parameters_json: { startDate, endDate },
      result_json: data ?? null,
    });

    return NextResponse.json({ ok: true, result: data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Payroll rebuild failed" },
      { status: 500 }
    );
  }
}
