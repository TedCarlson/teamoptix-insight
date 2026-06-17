import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

function cellText(value: unknown) {
  return String(value ?? "").trim();
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

    const { data: batches, error: batchError } = await supabase.rpc(
      "get_operations_report_batch_feed",
      {
        p_company_id: company.id,
        p_report_family_key: "FCC",
        p_service_dates: [serviceDate],
        p_limit: 1,
      }
    );

    if (batchError) {
      return NextResponse.json({ error: batchError.message, rows: [] }, { status: 500 });
    }

    const batch = batches?.[0] ?? null;

    if (!batch) {
      return NextResponse.json({
        source: "FCC",
        snapshot_kind: "IN_DAY",
        batch_id: null,
        created_at: null,
        generated_at_text: null,
        rows: [],
      });
    }

    const { data: rows, error: rowsError } = await supabase.rpc(
      "get_operations_fcc_current_rows",
      {
        p_company_id: company.id,
        p_service_date: serviceDate,
      }
    );

    if (rowsError) {
      return NextResponse.json({ error: rowsError.message, rows: [] }, { status: 500 });
    }

    return NextResponse.json({
      source: "FCC",
      snapshot_kind: "IN_DAY",
      batch_id: batch.id,
      created_at: batch.created_at,
      generated_at_text: batch.metadata_json?.fcc_header?.export_generated_text ?? null,
      report_date_text: batch.metadata_json?.fcc_header?.report_date_text ?? null,
      rows: (rows ?? []).map((row: any) => ({
        id: row.id,
        source_row_index: row.source_row_index,
        source_route_key: row.source_route_key,
        source_wa_number: row.source_wa_number,
        source_driver_name: row.source_driver_name,
        ...(row.normalized_row_json ?? {}),
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load current FCC snapshot.";
    return NextResponse.json({ error: message, rows: [] }, { status: 500 });
  }
}
