import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type ImportRow = {
  full_name?: string;
  email?: string;
  phone?: string;
  role?: string;
  market?: string;
  start_date?: string;
  status?: string;
  fx_id?: string;
  dswid?: string;
  issues?: string[];
};

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const supabase = await getSupabaseServerClient();
    const body = await req.json();

    const rows = Array.isArray(body?.rows) ? (body.rows as ImportRow[]) : [];

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "No rows provided for import." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase.rpc("import_company_roster_rows", {
      p_company_slug: slug,
      p_rows: rows,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      {
        ok: Boolean(data?.ok ?? true),
        inserted_count: Number(data?.inserted_count ?? 0),
      },
      { status: 200 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Import commit failed.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}