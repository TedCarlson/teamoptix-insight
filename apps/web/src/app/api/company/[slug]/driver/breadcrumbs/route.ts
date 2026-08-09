import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

type BreadcrumbRow = {
  id: string;
  company_id: string;
  profile_id: string | null;
  person_id: string | null;
  roster_member_id: string | null;
  service_date: string;
  captured_at: string;
  device_captured_at: string | null;
  latitude: number;
  longitude: number;
  accuracy_meters: number | null;
  source: string;
  tracking_context: string;
  source_activity_event_id: string | null;
  breadcrumb_payload: Record<string, unknown>;
};

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const serviceDate = req.nextUrl.searchParams.get("serviceDate") || todayIsoDate();

    const supabase = await getSupabaseServerClient();

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id")
      .eq("company_slug", slug)
      .single();

    if (companyError || !company) {
      return NextResponse.json({ error: "Company not found.", rows: [] }, { status: 404 });
    }

    const { data: breadcrumbs, error: breadcrumbError } = await supabase
      .from("driver_breadcrumb_point_v")
      .select(
        [
          "id",
          "company_id",
          "profile_id",
          "person_id",
          "roster_member_id",
          "service_date",
          "captured_at",
          "device_captured_at",
          "latitude",
          "longitude",
          "accuracy_meters",
          "source",
          "tracking_context",
          "source_activity_event_id",
          "breadcrumb_payload",
        ].join(",")
      )
      .eq("company_id", company.id)
      .eq("service_date", serviceDate)
      // Continuous Mobile Companion paths require a purpose-built governed
      // read surface. The legacy payroll evidence feed remains DRIVER_WEB-only.
      .eq("source", "DRIVER_WEB")
      .order("captured_at", { ascending: false });

    if (breadcrumbError) {
      return NextResponse.json({ error: breadcrumbError.message, rows: [] }, { status: 500 });
    }

    const breadcrumbRows = (breadcrumbs ?? []) as unknown as BreadcrumbRow[];

    const rosterIds = [
      ...new Set(breadcrumbRows.map((row) => row.roster_member_id).filter(Boolean)),
    ];

    const { data: rosterRows, error: rosterError } = rosterIds.length
      ? await supabase
          .from("company_roster_view")
          .select("roster_member_id, full_name, worker_type")
          .eq("company_id", company.id)
          .in("roster_member_id", rosterIds)
      : { data: [], error: null };

    if (rosterError) {
      return NextResponse.json({ error: rosterError.message, rows: [] }, { status: 500 });
    }

    const rosterById = new Map(
      (rosterRows ?? []).map((row) => [row.roster_member_id, row])
    );

    const rows = breadcrumbRows.map((row) => {
      const roster = row.roster_member_id ? rosterById.get(row.roster_member_id) : null;

      return {
        ...row,
        employee_name: roster?.full_name ?? null,
        worker_type: roster?.worker_type ?? null,
      };
    });

    return NextResponse.json({
      ok: true,
      service_date: serviceDate,
      rows,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load breadcrumbs.", rows: [] },
      { status: 500 }
    );
  }
}
