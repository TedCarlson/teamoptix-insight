import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCompanyBySlug } from "@/features/automation/server/automation.repository";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const supabase = await getSupabaseServerClient();

    const resolved = await resolveCompanyBySlug(supabase, slug);
    if (!resolved.company) {
      return NextResponse.json({ error: resolved.error ?? "Company not found.", rows: [] }, { status: 404 });
    }

    const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get("limit") ?? "20"), 1), 50);

    const { data, error } = await supabase
      .from("operations_automation_run_v")
      .select("*")
      .eq("company_id", resolved.company.id)
      .order("started_at", { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: error.message, rows: [] }, { status: 500 });
    }

    return NextResponse.json({ rows: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load automation runs.", rows: [] },
      { status: 500 }
    );
  }
}
