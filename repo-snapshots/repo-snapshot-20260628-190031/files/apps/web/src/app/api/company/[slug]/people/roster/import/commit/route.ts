import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type ImportRow = Record<string, unknown> & {
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
        updated_count: Number(data?.updated_count ?? 0),
        skipped_count: Number(data?.skipped_count ?? 0),
        errors: Array.isArray(data?.errors) ? data.errors : [],
      },
      { status: 200 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Import commit failed.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}