import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const sb = await getSupabaseServerClient();

    const { data: company, error: companyErr } = await sb
      .from("companies")
      .select("id")
      .eq("company_slug", slug)
      .single();

    if (companyErr || !company) {
      return NextResponse.json(
        { error: "Company not found.", pending: [], history: [] },
        { status: 404 }
      );
    }

    const { data: requests, error: requestErr } = await sb
      .from("driver_time_off_request")
      .select(
        "id, company_id, roster_member_id, profile_id, requested_dates, start_date, end_date, day_count, status, request_note, manager_note, schedule_override_id, submitted_at, reviewed_at, created_at, updated_at"
      )
      .eq("company_id", company.id)
      .order("submitted_at", { ascending: false });

    if (requestErr) {
      return NextResponse.json(
        { error: requestErr.message, pending: [], history: [] },
        { status: 500 }
      );
    }

    const rosterIds = Array.from(
      new Set((requests ?? []).map((row) => row.roster_member_id).filter(Boolean))
    );

    let rosterMap = new Map<
      string,
      { full_name: string | null; worker_type: string | null }
    >();

    if (rosterIds.length > 0) {
      const { data: rosterRows } = await sb
        .from("company_roster_view")
        .select("roster_member_id, full_name, worker_type")
        .eq("company_id", company.id)
        .in("roster_member_id", rosterIds);

      rosterMap = new Map(
        (rosterRows ?? []).map((row) => [
          String(row.roster_member_id),
          {
            full_name: row.full_name ?? null,
            worker_type: row.worker_type ?? null,
          },
        ])
      );
    }

    const rows = (requests ?? []).map((row) => {
      const roster = rosterMap.get(String(row.roster_member_id));

      return {
        ...row,
        full_name: roster?.full_name ?? null,
        worker_type: roster?.worker_type ?? null,
      };
    });

    return NextResponse.json({
      pending: rows.filter((row) => row.status === "PENDING"),
      history: rows.filter((row) => row.status !== "PENDING"),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load time off requests.",
        pending: [],
        history: [],
      },
      { status: 500 }
    );
  }
}
