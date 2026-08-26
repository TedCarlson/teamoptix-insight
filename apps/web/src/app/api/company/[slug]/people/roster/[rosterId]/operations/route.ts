import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { loadRosterAuthoritativeDto } from "@/features/people/server/loadRosterAuthoritativeDto";
import { findPersistenceMismatches } from "@/features/people/server/rosterPersistenceVerification";

export const runtime = "nodejs";

const OPERATIONS_PERSISTENCE_FIELDS = {
  fx_id: "text",
  dswid: "text",
  scanner_serial: "text",
  dot_expiration_date: "date",
  qual_cert_expiration_date: "date",
  daily_pay_effective_date: "date",
  daily_pay_rate: "number",
  fuel_card: "text",
  pin_id_no: "text",
} as const;

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

    const [currentOpsResult, currentIdentityResult] = await Promise.all([
      supabase
        .from("company_roster_operations_fact_v")
        .select("*")
        .eq("roster_id", rosterId)
        .maybeSingle(),
      supabase
        .from("company_roster_view")
        .select("fx_id, dswid")
        .eq("roster_member_id", rosterId)
        .maybeSingle(),
    ]);

    const { data: currentOps, error: currentOpsError } = currentOpsResult;
    const { data: currentIdentity, error: currentIdentityError } =
      currentIdentityResult;

    if (currentOpsError || currentIdentityError) {
      return NextResponse.json(
        {
          error: "Failed to load current operations record.",
          detail:
            currentOpsError?.message ?? currentIdentityError?.message,
        },
        { status: 500 },
      );
    }

    const has = (key: string) =>
      Object.prototype.hasOwnProperty.call(body, key);

    const pickText = (key: string, currentKey = key) =>
      has(key)
        ? textOrNull(body[key])
        : (currentOps?.[currentKey] ?? null);

    const pickDate = (key: string, currentKey = key) =>
      has(key)
        ? dateOrNull(body[key])
        : (currentOps?.[currentKey] ?? null);

    const pickNumber = (key: string, currentKey = key) =>
      has(key)
        ? body[key] === "" || body[key] == null
          ? null
          : Number(body[key])
        : (currentOps?.[currentKey] ?? null);

    const { error } = await supabase.rpc(
      "update_company_roster_operations",
      {
        p_company_slug: slug,
        p_roster_id: rosterId,
        p_fx_id: has("fx_id")
          ? textOrNull(body.fx_id)
          : (currentIdentity?.fx_id ?? null),
        p_dswid: has("dswid")
          ? textOrNull(body.dswid)
          : (currentIdentity?.dswid ?? null),
        p_scanner_serial: pickText("scanner_serial"),
        p_dot_exp: pickDate(
          "dot_expiration_date",
          "dot_exp",
        ),
        p_qual_cert_exp: pickDate(
          "qual_cert_expiration_date",
          "qual_cert_exp",
        ),
        p_daily_pay_effective_date: pickDate(
          "daily_pay_effective_date",
        ),
        p_daily_pay_rate: pickNumber("daily_pay_rate"),
        p_fuel_card: pickText("fuel_card"),
        p_pin_id_no: pickText("pin_id_no"),
      },
    );

    if (error) {
      return NextResponse.json(
        {
          error: "Failed to update operations.",
          detail: error.message,
          code: error.code ?? null,
        },
        { status: 500 },
      );
    }

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id")
      .eq("company_slug", slug)
      .single();

    if (companyError || !company) {
      return NextResponse.json(
        { error: "Company not found." },
        { status: 404 },
      );
    }

    const roster = await loadRosterAuthoritativeDto({
      supabase,
      companySlug: slug,
      companyId: company.id,
      rosterId,
    });

    if (!roster) {
      return NextResponse.json(
        {
          error:
            "Operations saved, but roster record could not be reloaded.",
        },
        { status: 500 },
      );
    }

    const mismatches = findPersistenceMismatches({
      submitted: body,
      persisted: roster,
      fields: OPERATIONS_PERSISTENCE_FIELDS,
    });

    if (mismatches.length > 0) {
      console.error("[roster-operations:patch] verification failed", {
        rosterId,
        fields: mismatches,
      });
      return NextResponse.json(
        {
          error: "Operations could not be verified after saving.",
          detail: "The record did not match the submitted update. Please try again.",
          fields: mismatches,
        },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { ok: true, roster },
      { status: 200 },
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to update operations.";

    console.error("[roster-operations:patch] failed", error);

    return NextResponse.json(
      { error: "Failed to update operations.", detail: message },
      { status: 500 },
    );
  }
}
