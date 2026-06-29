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
      return NextResponse.json(
        { error: resolved.error ?? "Company not found.", rows: [] },
        { status: 404 }
      );
    }

    const status = req.nextUrl.searchParams.get("status");
    const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get("limit") ?? "100"), 1), 100);

    let query = supabase
      .from("operations_collection_artifact_v")
      .select("*")
      .eq("company_id", resolved.company.id)
      .eq("artifact_kind", "REPORT_FILE")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status) {
      query = query.eq("artifact_status", status);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message, rows: [] }, { status: 500 });
    }

    return NextResponse.json({ rows: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load artifacts.",
        rows: [],
      },
      { status: 500 }
    );
  }
}
