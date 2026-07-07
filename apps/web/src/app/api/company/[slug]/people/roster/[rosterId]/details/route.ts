import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

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

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ slug: string; rosterId: string }> }
) {
  try {
    const { slug, rosterId } = await context.params;
    const supabase = await getSupabaseServerClient();
    const body = await req.json().catch(() => ({}));

    const { data: current, error: currentError } = await supabase
      .from("company_roster_view")
      .select("*")
      .eq("roster_member_id", rosterId)
      .maybeSingle();

    if (currentError || !current) {
      return NextResponse.json(
        {
          error: "Failed to load current person record.",
          detail: currentError?.message ?? "Current person record not found.",
        },
        { status: 500 }
      );
    }

    const pickText = (key: string) =>
      Object.prototype.hasOwnProperty.call(body, key)
        ? textOrNull(body[key])
        : (current[key] ?? null);

    const pickDate = (key: string) =>
      Object.prototype.hasOwnProperty.call(body, key)
        ? dateOrNull(body[key])
        : (current[key] ?? null);

    const { data, error } = await supabase.rpc("update_company_roster_details", {
      p_company_slug: slug,
      p_roster_id: rosterId,

      p_full_name: pickText("full_name"),
      p_email: pickText("email")?.toLowerCase() ?? null,
      p_phone: pickText("phone"),
      p_worker_type: pickText("worker_type"),
      p_market_code: pickText("market_code"),
      p_notes: pickText("notes"),

      p_date_of_birth: pickDate("date_of_birth"),
      p_address_line_1: pickText("address_line_1"),
      p_address_line_2: pickText("address_line_2"),
      p_city: pickText("city"),
      p_state_region: pickText("state_region"),
      p_postal_code: pickText("postal_code"),

      p_license_number: pickText("license_number"),
      p_issuing_state: pickText("issuing_state"),
      p_license_issue_date: pickDate("license_issue_date"),
      p_license_expiration_date: pickDate("license_expiration_date"),
    });

    
if (error) {
      return NextResponse.json(
        {
          error: "Failed to update details.",
          detail: error.message,
          code: error.code ?? null,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        roster: data ?? {},
      },
      { status: 200 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update details.";

    return NextResponse.json(
      { error: "Failed to update details.", detail: message },
      { status: 500 }
    );
  }
}
