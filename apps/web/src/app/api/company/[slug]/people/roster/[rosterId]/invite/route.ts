import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ slug: string; rosterId: string }> }
) {
  try {
    const { slug, rosterId } = await context.params;
    const supabase = await getSupabaseServerClient();

    const { data, error } = await supabase.rpc("send_company_roster_invite", {
      p_company_slug: slug,
      p_roster_id: rosterId,
    });

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: Boolean(data?.ok ?? true),
        roster_id: String(data?.roster_id ?? rosterId),
        invite_status: String(data?.invite_status ?? "Invited"),
      },
      { status: 200 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to send roster invite.";

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}