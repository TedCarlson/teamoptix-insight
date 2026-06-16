import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ slug: string }> };

function cellText(value: unknown) {
  return String(value ?? "").trim();
}

function addDaysIso(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function entryTime(row: any) {
  return (
    row.metadata_json?.generated_at_text ||
    row.metadata_json?.uploaded_at_text ||
    row.created_at ||
    null
  );
}

async function resolveCompany(slug: string, supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>) {
  const { data, error } = await supabase
    .from("companies")
    .select("id")
    .eq("company_slug", slug)
    .single();

  if (error || !data) return null;
  return data;
}

async function fetchBatches(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  companyId: string,
  family: string,
  serviceDates: string[],
  limit = 3
) {
  return supabase.rpc("get_operations_report_batch_feed", {
    p_company_id: companyId,
    p_report_family_key: family,
    p_service_dates: serviceDates,
    p_limit: limit,
  });
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const supabase = await getSupabaseServerClient();
    const company = await resolveCompany(slug, supabase);

    if (!company) {
      return NextResponse.json({ error: "Company not found.", sources: [] }, { status: 404 });
    }

    const url = new URL(req.url);
    const serviceDate = cellText(url.searchParams.get("date"));
    const surface = cellText(url.searchParams.get("surface"));

    if (!serviceDate) {
      return NextResponse.json({ error: "Service date is required.", sources: [] }, { status: 400 });
    }

    if (surface === "dispatch") {
      const priorDate = addDaysIso(serviceDate, -1);

      const [dro, dsw] = await Promise.all([
        fetchBatches(
          supabase,
          company.id,
          "DRO",
          [serviceDate, priorDate],
          8
        ),
        fetchBatches(
          supabase,
          company.id,
          "DSW",
          [serviceDate],
          1
        ),
      ]);

      if (dro.error) {
        return NextResponse.json({ error: dro.error.message, sources: [] }, { status: 500 });
      }

      if (dsw.error) {
        return NextResponse.json({ error: dsw.error.message, sources: [] }, { status: 500 });
      }

      const rows = dro.data ?? [];
      const am = rows.find((row: any) => row.report_frame === "AM" && row.service_date === serviceDate);
      const pm = rows.find((row: any) => row.report_frame === "PM" && row.service_date === priorDate);

      return NextResponse.json({
        sources: [
          {
            source: "DRO",
            entries: [am, pm].filter(Boolean).map((row: any) => ({
              id: row.id,
              timestamp: entryTime(row),
              label:
                row.report_frame === "AM"
                  ? "AM Snapshot"
                  : `PM Snapshot (${row.service_date})`,
              service_date: row.service_date,
              status: row.status,
            })),
          },
          {
            source: "DSW",
            entries: (dsw.data ?? []).map((row: any) => ({
              id: row.id,
              timestamp: entryTime(row),
              label: "Latest Upload",
              service_date: row.service_date,
              status: row.status,
            })),
          },
        ].filter((source) => source.entries.length > 0),
      });
    }

    if (surface === "delivery-window") {
      const [dsw, fcc] = await Promise.all([
        fetchBatches(supabase, company.id, "DSW", [serviceDate], 1),
        fetchBatches(supabase, company.id, "FCC", [serviceDate], 1),
      ]);

      if (dsw.error) {
        return NextResponse.json({ error: dsw.error.message, sources: [] }, { status: 500 });
      }

      if (fcc.error) {
        return NextResponse.json({ error: fcc.error.message, sources: [] }, { status: 500 });
      }

      return NextResponse.json({
        sources: [
          {
            source: "DSW",
            entries: (dsw.data ?? []).map((row: any) => ({
              id: row.id,
              timestamp: entryTime(row),
              label: "Latest Upload",
              service_date: row.service_date,
              status: row.status,
            })),
          },
          {
            source: "FCC",
            entries: (fcc.data ?? []).map((row: any) => ({
              id: row.id,
              timestamp: entryTime(row),
              label: "Latest Upload",
              service_date: row.service_date,
              status: row.status,
            })),
          },
        ].filter((source) => source.entries.length > 0),
      });
    }

    return NextResponse.json({ error: "Unsupported surface.", sources: [] }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load intelligence feed.";
    return NextResponse.json({ error: message, sources: [] }, { status: 500 });
  }
}
