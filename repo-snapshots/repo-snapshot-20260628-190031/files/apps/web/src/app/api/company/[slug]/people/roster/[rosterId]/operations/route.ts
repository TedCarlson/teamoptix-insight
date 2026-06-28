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

    const { data, error } = await supabase.rpc("update_company_roster_operations", {
      p_company_slug: slug,
      p_roster_id: rosterId,
      p_fx_id: textOrNull(body.fx_id),
      p_dswid: textOrNull(body.dswid),
      p_scanner_serial: textOrNull(body.scanner_serial),
      p_dot_exp: dateOrNull(body.dot_expiration_date),
      p_qual_cert_exp: dateOrNull(body.qual_cert_expiration_date),
      p_daily_pay_effective_date: dateOrNull(body.daily_pay_effective_date),
      p_daily_pay_rate: body.daily_pay_rate === "" || body.daily_pay_rate == null ? null : Number(body.daily_pay_rate),
      p_fuel_card: textOrNull(body.fuel_card),
      p_pin_id_no: textOrNull(body.pin_id_no),
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

    return NextResponse.json({ ok: true, roster: data }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update operations.";

    return NextResponse.json(
      { error: "Failed to update operations.", detail: message },
      { status: 500 }
    );
  }
}
