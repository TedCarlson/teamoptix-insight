import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { reconcileRosterImport, type RosterImportRow } from "@/features/people/server/rosterImportReconciliation";

export const runtime = "nodejs";

export async function POST(req: NextRequest, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params;
    const body = await req.json();
    const rows = Array.isArray(body?.rows) ? (body.rows as RosterImportRow[]) : [];
    const approvedRows = new Set(Array.isArray(body?.approved_row_numbers) ? body.approved_row_numbers.map(Number) : []);
    if (!rows.length) return NextResponse.json({ error: "No rows provided for import." }, { status: 400 });

    const supabase = await getSupabaseServerClient();
    const decisions = await reconcileRosterImport(supabase, slug, rows);
    const commitRows = decisions
      .filter((item) => approvedRows.has(item.row_number) && (item.decision === "NEW" || item.decision === "UPDATE_DRAFT"))
      .map((item) => ({ ...item.row, roster_member_id: item.roster_member_id, import_decision: item.decision, approved: true }));

    if (!commitRows.length) return NextResponse.json({ error: "No approved new or update rows are eligible to commit." }, { status: 400 });

    const { data, error } = await supabase.rpc("import_company_roster_rows", { p_company_slug: slug, p_rows: commitRows });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      ok: Boolean(data?.ok ?? true),
      inserted_count: Number(data?.inserted_count ?? 0),
      updated_count: Number(data?.updated_count ?? 0),
      skipped_count: Number(data?.skipped_count ?? 0),
      errors: Array.isArray(data?.errors) ? data.errors : [],
    }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Import commit failed." }, { status: 500 });
  }
}
