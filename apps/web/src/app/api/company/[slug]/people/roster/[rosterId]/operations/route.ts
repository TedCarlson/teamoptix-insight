import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ slug: string; rosterId: string }>;
};

function textOrNull(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function dateOrNull(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const { slug, rosterId } = await context.params;
    const body = await req.json().catch(() => ({}));
    const supabase = await getSupabaseServerClient();

    const { data: currentOps, error: currentOpsError } = await supabase
      .from("company_roster_operations_fact_v")
      .select("*")
      .eq("roster_id", rosterId)
      .maybeSingle();

    if (currentOpsError) {
      return NextResponse.json(
        {
          error: "Failed to load current operations record.",
          detail: currentOpsError.message,
        },
        { status: 500 }
      );
    }

    const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key);
    const pickText = (key: string, currentKey = key) =>
      has(key) ? textOrNull(body[key]) : (currentOps?.[currentKey] ?? null);
    const pickDate = (key: string, currentKey = key) =>
      has(key) ? dateOrNull(body[key]) : (currentOps?.[currentKey] ?? null);
    const pickNumber = (key: string, currentKey = key) =>
      has(key)
        ? body[key] === "" || body[key] == null
          ? null
          : Number(body[key])
        : (currentOps?.[currentKey] ?? null);

    const { data, error } = await supabase.rpc("update_company_roster_operations", {
      p_company_slug: slug,
      p_roster_id: rosterId,
      p_fx_id: pickText("fx_id"),
      p_dswid: pickText("dswid"),
      p_scanner_serial: pickText("scanner_serial"),
      p_dot_exp: pickDate("dot_expiration_date", "dot_exp"),
      p_qual_cert_exp: pickDate("qual_cert_expiration_date", "qual_cert_exp"),
      p_daily_pay_effective_date: pickDate("daily_pay_effective_date"),
      p_daily_pay_rate: pickNumber("daily_pay_rate"),
      p_fuel_card: pickText("fuel_card"),
      p_pin_id_no: pickText("pin_id_no"),
    });

    if (error) {
      return NextResponse.json(
        {
          error: "Failed to update operations.",
          detail: error.message,
          code: error.code ?? null,
        },
        { status: 500 }
      );
    }

    const { data: hydratedOps, error: hydrateError } = await supabase
      .from("company_roster_operations_fact_v")
      .select(
        "roster_id, fx_id, dswid, scanner_serial, dot_exp, qual_cert_exp, daily_pay_effective_date, daily_pay_rate, fuel_card, pin_id_no"
      )
      .eq("roster_id", rosterId)
      .maybeSingle();

    if (hydrateError) {
      return NextResponse.json(
        {
          error: "Operations saved, but failed to hydrate updated record.",
          detail: hydrateError.message,
          code: hydrateError.code ?? null,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        roster: {
          roster_id: rosterId,
          id: rosterId,
          fx_id: hydratedOps?.fx_id ?? null,
          dswid: hydratedOps?.dswid ?? null,
          scanner_serial: hydratedOps?.scanner_serial ?? null,
          dot_expiration_date: hydratedOps?.dot_exp ?? null,
          qual_cert_expiration_date: hydratedOps?.qual_cert_exp ?? null,
          daily_pay_effective_date:
            hydratedOps?.daily_pay_effective_date ?? null,
          daily_pay_rate: hydratedOps?.daily_pay_rate ?? null,
          fuel_card: hydratedOps?.fuel_card ?? null,
          pin_id_no: hydratedOps?.pin_id_no ?? null,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update operations.";

    return NextResponse.json(
      { error: "Failed to update operations.", detail: message },
      { status: 500 }
    );
  }
}
