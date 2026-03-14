import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ slug: string; rosterId: string }> }
) {
  try {
    const { slug, rosterId } = await context.params;
    const supabase = await getSupabaseServerClient();

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id")
      .eq("company_slug", slug)
      .single();

    if (companyError || !company) {
      return NextResponse.json(
        { error: "Company not found.", events: [] },
        { status: 404 }
      );
    }

    const { data: events, error: eventsError } = await supabase
      .from("company_roster_event_view")
      .select(
        [
          "id",
          "company_id",
          "roster_id",
          "event_category",
          "event_type",
          "event_detail",
          "event_metadata",
          "occurred_at",
          "created_at",
        ].join(", ")
      )
      .eq("company_id", company.id)
      .eq("roster_id", rosterId)
      .order("occurred_at", { ascending: false });

    if (eventsError) {
      return NextResponse.json(
        { error: eventsError.message, events: [] },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { events: events ?? [] },
      { status: 200 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load roster events.";

    return NextResponse.json(
      { error: message, events: [] },
      { status: 500 }
    );
  }
}