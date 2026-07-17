import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params;
    const id = request.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Opportunity id is required." }, { status: 400 });
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase.rpc("get_opportunity_analysis", { p_company_slug: slug, p_opportunity_id: id });
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Opportunity not found." }, { status: 404 });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Load failed." }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params;
    const payload = await request.json();
    if (!payload?.source_text || !payload?.parsed_listing) {
      return NextResponse.json({ error: "An analyzed listing is required." }, { status: 400 });
    }
    const supabase = await getSupabaseServerClient();
    const { data, error } = await supabase.rpc("save_opportunity_analysis", {
      p_company_slug: slug,
      p_payload: payload,
    });
    if (error) throw error;
    return NextResponse.json({ id: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Save failed." }, { status: 500 });
  }
}
