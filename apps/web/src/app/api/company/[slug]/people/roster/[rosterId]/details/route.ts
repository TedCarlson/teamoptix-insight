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

    const { data, error } = await supabase.rpc("update_company_roster_details", {
      p_company_slug: slug,
      p_roster_id: rosterId,

      p_full_name: textOrNull(body.full_name),
      p_email: textOrNull(body.email)?.toLowerCase() ?? null,
      p_phone: textOrNull(body.phone),
      p_worker_type: textOrNull(body.worker_type),
      p_market_code: textOrNull(body.market_code),
      p_notes: textOrNull(body.notes),

      p_date_of_birth: dateOrNull(body.date_of_birth),
      p_address_line_1: textOrNull(body.address_line_1),
      p_address_line_2: textOrNull(body.address_line_2),
      p_city: textOrNull(body.city),
      p_state_region: textOrNull(body.state_region),
      p_postal_code: textOrNull(body.postal_code),

      p_license_number: textOrNull(body.license_number),
      p_issuing_state: textOrNull(body.issuing_state),
      p_license_issue_date: dateOrNull(body.license_issue_date),
      p_license_expiration_date: dateOrNull(body.license_expiration_date),
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

    const note = textOrNull(body.notes);
    const { data: noteData, error: noteError } = await supabase.rpc(
      "update_company_roster_note",
      {
        p_company_slug: slug,
        p_roster_id: rosterId,
        p_note: note,
      }
    );

    if (noteError) {
      return NextResponse.json(
        {
          error: "Details saved, but note failed to persist.",
          detail: noteError.message,
          code: noteError.code ?? null,
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
