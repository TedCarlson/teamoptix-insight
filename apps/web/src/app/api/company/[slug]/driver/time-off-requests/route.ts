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
  device_submission_id?: unknown;
  intent_confirmation?: unknown;
};

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function blackoutErrorMessage(message: string) {
  const marker = "TIME_OFF_BLACKOUT_DATE|";
  const markerIndex = message.indexOf(marker);
  if (markerIndex < 0) return message;

  const [date, guidance] = message.slice(markerIndex + marker.length).split("|");
  return guidance
    ? `${date} is a blackout date. ${guidance}`
    : `${date} is a blackout date. Please contact your leadership team directly if you have a persistent need for time off.`;
}

export async function GET(req: NextRequest, context: RouteContext) {
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

    const startDate = req.nextUrl.searchParams.get("start_date");
    const endDate = req.nextUrl.searchParams.get("end_date");
    let blackoutDates: unknown[] = [];

    if (isIsoDate(startDate) && isIsoDate(endDate) && startDate <= endDate) {
      const { data: blackoutRows, error: blackoutError } = await sb.rpc(
        "operations_blackout_dates",
        {
          p_company_slug: slug,
          p_start_date: startDate,
          p_end_date: endDate,
        }
      );

      if (blackoutError) {
        return NextResponse.json(
          { error: blackoutError.message, rows: rows ?? [], blackout_dates: [] },
          { status: 500 }
        );
      }

      blackoutDates = Array.isArray(blackoutRows) ? blackoutRows : [];
    }

    return NextResponse.json({ rows: rows ?? [], blackout_dates: blackoutDates });
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
    const deviceSubmissionId =
      typeof body.device_submission_id === "string"
        ? body.device_submission_id
        : crypto.randomUUID();
    const requestedDates = Array.isArray(body.requested_dates)
      ? body.requested_dates
      : [];
    const requestNote =
      typeof body.request_note === "string" ? body.request_note : null;
    const intentConfirmation =
      body.intent_confirmation &&
      typeof body.intent_confirmation === "object" &&
      !Array.isArray(body.intent_confirmation)
        ? body.intent_confirmation
        : {};

    const { data, error } = await sb.rpc("submit_driver_time_off_request", {
      p_company_slug: slug,
      p_device_submission_id: deviceSubmissionId,
      p_requested_dates: requestedDates,
      p_request_note: requestNote,
      p_intent_confirmation: intentConfirmation,
    });

    if (error) {
      return NextResponse.json(
        {
          error: blackoutErrorMessage(error.message),
          step: "submit_driver_time_off_request",
        },
        { status: 400 }
      );
    }

    return NextResponse.json(data, { status: 201 });
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
