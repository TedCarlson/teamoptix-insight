import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string; rosterId: string }> }
) {
  try {
    const { slug, rosterId } = await params;
    const supabase = await getSupabaseServerClient();

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id")
      .eq("company_slug", slug)
      .single();

    if (companyError || !company) {
      return NextResponse.json(
        { error: "Company not found." },
        { status: 404 }
      );
    }

    const { data: rosterRow, error: rosterError } = await supabase
      .schema("core")
      .from("company_roster")
      .select("id, company_id, employment_status, onboarding_completed_at")
      .eq("id", rosterId)
      .eq("company_id", company.id)
      .single();

    if (rosterError || !rosterRow) {
      return NextResponse.json(
        { error: "Candidate not found." },
        { status: 404 }
      );
    }

    if (!rosterRow.onboarding_completed_at) {
      return NextResponse.json(
        { error: "Candidate has not completed onboarding." },
        { status: 400 }
      );
    }

    const { error: activateError } = await supabase
      .schema("core")
      .from("company_roster")
      .update({
        employment_status: "Active",
      })
      .eq("id", rosterId);

    if (activateError) {
      return NextResponse.json(
        { error: activateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to activate candidate.";

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}