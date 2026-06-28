import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

function cellText(value: unknown) {
  return String(value ?? "").trim();
}

function dswIdentityKey(value: unknown) {
  const normalized = String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z,\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return "";

  if (normalized.includes(",")) {
    const [lastRaw, restRaw = ""] = normalized.split(",");
    const last = lastRaw.trim();
    const first = restRaw.trim().split(" ")[0] ?? "";
    return last && first ? `${last}|${first}` : "";
  }

  const parts = normalized.split(" ").filter(Boolean);
  if (parts.length < 2) return "";

  const first = parts[0];
  const last = parts[parts.length - 1];
  return last && first ? `${last}|${first}` : "";
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const supabase = await getSupabaseServerClient();

    const url = new URL(req.url);
    const serviceDate = cellText(url.searchParams.get("date"));

    if (!serviceDate) {
      return NextResponse.json({ error: "Service date is required.", rows: [] }, { status: 400 });
    }

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id")
      .eq("company_slug", slug)
      .single();

    if (companyError || !company) {
      return NextResponse.json({ error: "Company not found.", rows: [] }, { status: 404 });
    }

    const { data, error } = await supabase.rpc("get_operations_dsw_current_rows", {
      p_company_id: company.id,
      p_service_date: serviceDate,
    });

    if (error) {
      return NextResponse.json({ error: error.message, rows: [] }, { status: 500 });
    }

    const rows = data ?? [];

    const { data: rosterOps, error: rosterOpsError } = await supabase
      .from("company_roster_view")
      .select("roster_member_id, full_name, dswid")
      .eq("company_id", company.id);

    if (rosterOpsError) {
      return NextResponse.json({ error: rosterOpsError.message, rows: [] }, { status: 500 });
    }

    const rosterByDswid = new Map<
      string,
      { roster_member_id: string | null; full_name: string | null; dswid: string | null }
    >();

    for (const op of rosterOps ?? []) {
      const key = dswIdentityKey(op.dswid);
      if (key) {
        rosterByDswid.set(key, {
          roster_member_id: op.roster_member_id ?? null,
          full_name: op.full_name ?? null,
          dswid: op.dswid ?? null,
        });
      }
    }

    const enrichedRows = rows.map((row: { driver_name?: string | null; ils_percent?: number | string | null; normalized_row_json?: Record<string, unknown> | null }) => {
      const matched = rosterByDswid.get(dswIdentityKey(row.driver_name)) ?? null;
      const normalized = row.normalized_row_json ?? {};
      const ilsPercent = row.ils_percent ?? normalized.ils_percent ?? null;

      return {
        ...row,
        ils_percent: ilsPercent,
        matched_roster_member_id: matched?.roster_member_id ?? null,
        matched_roster_full_name: matched?.full_name ?? null,
        matched_roster_dswid: matched?.dswid ?? null,
      };
    });

    const first = enrichedRows[0] ?? null;

    return NextResponse.json({
      source: "DSW",
      snapshot_kind: "IN_DAY",
      generated_at_text: first?.generated_at_text ?? null,
      terminal_identity: first?.terminal_identity ?? null,
      contract_filter: first?.contract_filter ?? null,
      rows: enrichedRows,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load current DSW snapshot.";
    return NextResponse.json({ error: message, rows: [] }, { status: 500 });
  }
}
