import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ slug: string; overrideId: string }>;
};

type UpdatePayload = {
  end_date?: string | null;
  manager_note?: string | null;
  disposition?: "CANCELLED" | "RESCINDED" | null;
};

function cleanText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const { slug, overrideId } = await context.params;
    const body = (await req.json().catch(() => ({}))) as UpdatePayload;
    const endDate = cleanText(body.end_date);
    const sb = await getSupabaseServerClient();

    if (!endDate) {
      return NextResponse.json(
        { error: "end_date is required." },
        { status: 400 }
      );
    }

    const { data, error } = await sb.rpc("update_company_resignation_notice", {
      p_company_slug: slug,
      p_override_id: overrideId,
      p_last_scheduled_date: endDate,
      p_manager_note: cleanText(body.manager_note),
    });

    if (error) {
      return NextResponse.json(
        { error: error.message, step: "update_resignation_notice" },
        { status: 500 }
      );
    }

    return NextResponse.json(data ?? { ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update resignation notice.",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
  try {
    const { slug, overrideId } = await context.params;
    const sb = await getSupabaseServerClient();

    const { data: company, error: companyErr } = await sb
      .from("companies")
      .select("id")
      .eq("company_slug", slug)
      .single();

    if (companyErr || !company) {
      return NextResponse.json(
        { error: "Company not found" },
        { status: 404 }
      );
    }

    const { data: overrideRow, error: overrideLookupErr } = await sb
      .from("schedule_override")
      .select("id, start_date, override_type")
      .eq("company_id", company.id)
      .eq("id", overrideId)
      .maybeSingle();

    if (overrideLookupErr || !overrideRow) {
      return NextResponse.json(
        { error: "Override not found" },
        { status: 404 }
      );
    }

    if (overrideRow.override_type === "RESIGNATION_NOTICE") {
      const disposition = cleanText(
        new URL(_req.url).searchParams.get("disposition")
      ) === "RESCINDED" ? "RESCINDED" : "CANCELLED";
      const { data, error } = await sb.rpc("cancel_company_resignation_notice", {
        p_company_slug: slug,
        p_override_id: overrideId,
        p_disposition: disposition,
      });

      if (error) {
        return NextResponse.json(
          { error: error.message, step: "cancel_resignation_notice" },
          { status: 500 }
        );
      }

      return NextResponse.json(data ?? { ok: true });
    }

    const { error: updateErr } = await sb
      .from("schedule_override")
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq("company_id", company.id)
      .eq("id", overrideId);

    if (updateErr) {
      return NextResponse.json(
        { error: updateErr.message, step: "deactivate_override" },
        { status: 500 }
      );
    }

    const { data: commitData, error: commitErr } = await sb.rpc(
      "paint_schedule_day_fact_for_company",
      {
        p_company_id: company.id,
        p_start_date: overrideRow.start_date,
        p_horizon_days: 70,
      }
    );

    if (commitErr) {
      return NextResponse.json(
        {
          error: commitErr.message,
          step: "paint_schedule_day_fact_for_company",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      commit: commitData ?? {},
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to remove override.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
