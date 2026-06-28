import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ slug: string; rosterId: string }>;
};

export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const { slug, rosterId } = await context.params;
    const supabase = await getSupabaseServerClient();

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id")
      .eq("company_slug", slug)
      .single();

    if (companyError || !company) {
      return NextResponse.json({ error: "Company not found." }, { status: 404 });
    }

    const { data: events, error } = await supabase
      .from("company_roster_event_view")
      .select("id, company_id, roster_id, event_category, event_type, event_detail, event_metadata, occurred_at, created_at")
      .eq("company_id", company.id)
      .eq("roster_id", rosterId)
      .order("occurred_at", { ascending: false })
      .limit(30);

    if (error) {
      return NextResponse.json(
        { error: "Failed to load timeline.", detail: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ events: events ?? [] }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load timeline.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
