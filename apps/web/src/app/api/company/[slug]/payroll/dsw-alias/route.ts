import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params;
    const body = await req.json();

    const aliasText = String(body?.alias_text ?? "").trim();
    const rosterId = String(body?.roster_id ?? "").trim();

    if (!aliasText || !rosterId) {
      return NextResponse.json({ error: "alias_text and roster_id are required." }, { status: 400 });
    }

    const supabase = await getSupabaseServerClient();

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id")
      .eq("company_slug", slug)
      .single();

    if (companyError || !company) {
      return NextResponse.json({ error: "Company not found." }, { status: 404 });
    }

    const { error } = await supabase.rpc("create_roster_dsw_alias", {
      p_company_id: company.id,
      p_roster_id: rosterId,
      p_alias_text: aliasText,
      p_created_by: null,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Alias save failed." },
      { status: 500 }
    );
  }
}
