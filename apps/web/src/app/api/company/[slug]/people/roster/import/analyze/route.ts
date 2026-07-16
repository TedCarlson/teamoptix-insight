import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { reconcileRosterImport, type RosterImportRow } from "@/features/people/server/rosterImportReconciliation";

export const runtime = "nodejs";

export async function POST(req: NextRequest, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params;
    const body = await req.json();
    const rows = Array.isArray(body?.rows) ? (body.rows as RosterImportRow[]) : [];
    if (!rows.length) return NextResponse.json({ error: "No rows provided for analysis." }, { status: 400 });
    const supabase = await getSupabaseServerClient();
    const decisions = await reconcileRosterImport(supabase, slug, rows);
    const counts = decisions.reduce<Record<string, number>>((result, item) => {
      result[item.decision] = (result[item.decision] ?? 0) + 1;
      return result;
    }, {});
    return NextResponse.json({ decisions, counts }, { status: 200 });
  } catch (error) {
    console.error("[roster-import:analyze] failed", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Roster analysis failed.",
      },
      { status: 500 },
    );
  }
}
