import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params;
    const body = await req.json();

    const aliasText = String(body?.alias_text ?? "").trim();
    const rosterId = String(body?.roster_id ?? "").trim();

    if (!aliasText || !rosterId) {
      return NextResponse.json({ error: "alias_text and roster_id are required." }, { status: 400 });
    }

    const supabase = await getSupabaseServerClient();

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id")
      .eq("company_slug", slug)
      .single();

    if (companyError || !company) {
      return NextResponse.json({ error: "Company not found." }, { status: 404 });
    }

    const { error } = await supabase.rpc("create_roster_dsw_alias", {
      p_company_id: company.id,
      p_roster_id: rosterId,
      p_alias_text: aliasText,
      p_created_by: null,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data: currentOps, error: opsReadError } = await supabase
      .from("company_roster_operations_fact_v")
      .select("fx_id, scanner_serial, dot_exp, qual_cert_exp, daily_pay_effective_date, daily_pay_rate, fuel_card, pin_id_no")
      .eq("roster_id", rosterId)
      .maybeSingle();

    if (opsReadError) {
      return NextResponse.json({ error: opsReadError.message }, { status: 500 });
    }

    const { error: opsUpdateError } = await supabase.rpc("update_company_roster_operations", {
      p_company_slug: slug,
      p_roster_id: rosterId,
      p_fx_id: currentOps?.fx_id ?? null,
      p_dswid: aliasText,
      p_scanner_serial: currentOps?.scanner_serial ?? null,
      p_dot_exp: currentOps?.dot_exp ?? null,
      p_qual_cert_exp: currentOps?.qual_cert_exp ?? null,
      p_daily_pay_effective_date: currentOps?.daily_pay_effective_date ?? null,
      p_daily_pay_rate: currentOps?.daily_pay_rate ?? null,
      p_fuel_card: currentOps?.fuel_card ?? null,
      p_pin_id_no: currentOps?.pin_id_no ?? null,
    });

    if (opsUpdateError) {
      return NextResponse.json({ error: opsUpdateError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Alias save failed." },
      { status: 500 }
    );
  }
}
