import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params;
    const analysisId = request.nextUrl.searchParams.get("analysisId");
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase.rpc("list_opportunity_model_versions", {
      p_company_slug: slug,
      p_analysis_id: analysisId,
    });
    if (error) throw error;
    return NextResponse.json(data ?? []);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Load failed.") }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params;
    const payload = await request.json();
    if (!payload?.analysisId || !payload?.assumptions || !payload?.results) {
      return NextResponse.json({ error: "Opportunity, assumptions, and model results are required." }, { status: 400 });
    }
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase.rpc("save_opportunity_model_version", {
      p_company_slug: slug,
      p_analysis_id: payload.analysisId,
      p_assumptions: payload.assumptions,
      p_results: payload.results,
      p_version_name: payload.versionName ?? null,
    });
    if (error) throw error;
    return NextResponse.json(Array.isArray(data) ? data[0] : data);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Save failed.") }, { status: 500 });
  }
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return fallback;
}
