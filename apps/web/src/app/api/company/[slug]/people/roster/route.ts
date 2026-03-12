import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const supabase = await getSupabaseServerClient();

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id, company_slug")
      .eq("company_slug", slug)
      .single();

    if (companyError || !company) {
      return NextResponse.json(
        { error: "Company not found.", roster: [] },
        { status: 404 }
      );
    }

    const { data: roster, error: rosterError } = await supabase
      .from("company_roster_view")
      .select("*")
      .eq("company_id", company.id)
      .order("full_name");

    if (rosterError) {
      return NextResponse.json(
        { error: rosterError.message, roster: [] },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        company_id: company.id,
        roster: roster ?? [],
      },
      { status: 200 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Roster query failed.";

    return NextResponse.json(
      { error: message, roster: [] },
      { status: 500 }
    );
  }
}