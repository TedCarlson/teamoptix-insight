import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

type AccessContext = {
  auth_user_id?: string | null;
  profile_id?: string | null;
};

type RequestPayload = {
  requested_dates?: unknown;
  request_note?: unknown;
};

function cleanNote(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 500) : null;
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function utcDayValue(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function todayIsoUtc() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeDates(value: unknown) {
  if (!Array.isArray(value)) return [];

  return Array.from(new Set(value.filter(isIsoDate))).sort();
}

function minNoticeDays(firstDate: string) {
  const today = utcDayValue(todayIsoUtc());
  const requested = utcDayValue(firstDate);
  return Math.floor((requested - today) / 86_400_000);
}

export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const sb = await getSupabaseServerClient();

    const { data: access, error: accessError } = await sb.rpc("access_context");

    if (accessError) {
      return NextResponse.json(
        { error: accessError.message, rows: [] },
        { status: 401 }
      );
    }

    const typedAccess = access as AccessContext | null;

    if (!typedAccess?.profile_id) {
      return NextResponse.json({ rows: [] }, { status: 200 });
    }

    const { data: company, error: companyErr } = await sb
      .from("companies")
      .select("id")
      .eq("company_slug", slug)
      .single();

    if (companyErr || !company) {
      return NextResponse.json(
        { error: "Company not found.", rows: [] },
        { status: 404 }
      );
    }

    const { data: rows, error: requestErr } = await sb
      .from("driver_time_off_request")
      .select(
        "id, company_id, roster_member_id, profile_id, requested_dates, start_date, end_date, day_count, status, request_note, manager_note, schedule_override_id, submitted_at, reviewed_at, created_at, updated_at"
      )
      .eq("company_id", company.id)
      .eq("profile_id", typedAccess.profile_id)
      .order("start_date", { ascending: true });

    if (requestErr) {
      return NextResponse.json(
        { error: requestErr.message, rows: [] },
        { status: 500 }
      );
    }

    return NextResponse.json({ rows: rows ?? [] });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load time off requests.",
        rows: [],
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const sb = await getSupabaseServerClient();
    const body = (await req.json()) as RequestPayload;

    const { data: access, error: accessError } = await sb.rpc("access_context");

    if (accessError) {
      return NextResponse.json({ error: accessError.message }, { status: 401 });
    }

    const typedAccess = access as AccessContext | null;

    if (!typedAccess?.profile_id) {
      return NextResponse.json(
        { error: "Profile is required to submit a time off request." },
        { status: 401 }
      );
    }

    const { data: company, error: companyErr } = await sb
      .from("companies")
      .select("id")
      .eq("company_slug", slug)
      .single();

    if (companyErr || !company) {
      return NextResponse.json({ error: "Company not found." }, { status: 404 });
    }

    const requestedDates = normalizeDates(body.requested_dates);

    if (requestedDates.length < 1) {
      return NextResponse.json(
        { error: "Select at least one day before submitting a request." },
        { status: 400 }
      );
    }

    if (requestedDates.length > 15) {
      return NextResponse.json(
        {
          error:
            "Requests longer than 15 days should be discussed directly with leadership.",
        },
        { status: 400 }
      );
    }

    const firstDate = requestedDates[0];
    const lastDate = requestedDates[requestedDates.length - 1];

    if (minNoticeDays(firstDate) < 10) {
      return NextResponse.json(
        {
          error:
            "Time off requests require at least 10 days notice. Please speak directly with leadership for near-term schedule changes.",
        },
        { status: 400 }
      );
    }

    const { data: rosterRow, error: rosterErr } = await sb
      .from("company_roster_view")
      .select("roster_member_id")
      .eq("company_id", company.id)
      .eq("profile_id", typedAccess.profile_id)
      .maybeSingle();

    if (rosterErr || !rosterRow?.roster_member_id) {
      return NextResponse.json(
        { error: "Roster record not found for this driver." },
        { status: 404 }
      );
    }

    const { data: inserted, error: insertErr } = await sb
      .from("driver_time_off_request")
      .insert({
        company_id: company.id,
        roster_member_id: rosterRow.roster_member_id,
        profile_id: typedAccess.profile_id,
        requested_by_auth_user_id: typedAccess.auth_user_id ?? null,
        requested_dates: requestedDates,
        start_date: firstDate,
        end_date: lastDate,
        day_count: requestedDates.length,
        status: "PENDING",
        request_note: cleanNote(body.request_note),
      })
      .select(
        "id, company_id, roster_member_id, profile_id, requested_dates, start_date, end_date, day_count, status, request_note, submitted_at, created_at"
      )
      .single();

    if (insertErr) {
      return NextResponse.json(
        { error: insertErr.message, step: "insert_time_off_request" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, request: inserted }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to submit time off request.",
      },
      { status: 500 }
    );
  }
}
