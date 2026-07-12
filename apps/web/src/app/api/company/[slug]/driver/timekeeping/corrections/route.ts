import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  cleanTimekeepingOversightMode,
  deriveMissingClockOutDiscrepancies,
  isDriverCorrectionMode,
} from "@/features/driver/timekeeping/discrepancies";

export const runtime = "nodejs";

type AccessMembership = {
  company_slug?: string | null;
};

type AccessContext = {
  profile_id?: string | null;
  person_id?: string | null;
  memberships?: AccessMembership[] | null;
};

type ActivityEvent = {
  id: string;
  event_type: string;
  service_date: string;
  occurred_at: string;
  roster_member_id: string | null;
};

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isValidIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isValidTimestamp(value: string) {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed);
}

const MAX_CORRECTED_CLOCK_OUT_HOURS = 14;
const MAX_CORRECTED_CLOCK_OUT_MS = MAX_CORRECTED_CLOCK_OUT_HOURS * 60 * 60 * 1000;

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  const body = asObject(await req.json().catch(() => ({})));
  const correctionType = stringOrNull(body.type)?.toUpperCase();
  const serviceDate = stringOrNull(body.service_date);
  const clockOutAt = stringOrNull(body.clock_out_at);
  const driverNote = stringOrNull(body.driver_note);

  if (correctionType !== "MISSING_CLOCK_OUT") {
    return NextResponse.json({ error: "Unsupported correction type." }, { status: 400 });
  }

  if (!serviceDate || !isValidIsoDate(serviceDate)) {
    return NextResponse.json({ error: "A valid service_date is required." }, { status: 400 });
  }

  if (!clockOutAt || !isValidTimestamp(clockOutAt)) {
    return NextResponse.json({ error: "A valid clock_out_at timestamp is required." }, { status: 400 });
  }

  const supabase = await getSupabaseServerClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { data: access, error: accessError } = await supabase.rpc("access_context");

  if (accessError) {
    return NextResponse.json({ error: accessError.message }, { status: 500 });
  }

  const typedAccess = access as AccessContext | null;
  const membership = typedAccess?.memberships?.find((item) => item.company_slug === slug);

  if (!membership) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id, company_slug")
    .eq("company_slug", slug)
    .single();

  if (companyError || !company) {
    return NextResponse.json({ error: "Company not found." }, { status: 404 });
  }

  const { data: config, error: configError } = await supabase.rpc("get_company_operations_config", {
    p_company_slug: slug,
  });

  if (configError) {
    return NextResponse.json({ error: configError.message }, { status: 500 });
  }

  const oversightMode = cleanTimekeepingOversightMode(
    (config as { timekeeping_oversight_mode?: unknown } | null)?.timekeeping_oversight_mode
  );

  if (!isDriverCorrectionMode(oversightMode)) {
    return NextResponse.json(
      { error: "Timekeeping correction is not active for this company." },
      { status: 403 }
    );
  }

  const { data: rosterRow } = await supabase
    .from("company_roster_view")
    .select("roster_member_id")
    .eq("company_id", company.id)
    .eq("profile_id", typedAccess?.profile_id ?? "")
    .maybeSingle();

  const rosterMemberId = rosterRow?.roster_member_id ?? null;

  if (!rosterMemberId) {
    return NextResponse.json({ error: "Driver roster record not found." }, { status: 400 });
  }

  const { data: events, error: eventsError } = await supabase
    .from("driver_activity_event_v")
    .select("id, event_type, service_date, occurred_at, roster_member_id")
    .eq("company_id", company.id)
    .eq("profile_id", typedAccess?.profile_id ?? "")
    .eq("roster_member_id", rosterMemberId)
    .eq("service_date", serviceDate)
    .order("occurred_at", { ascending: true });

  if (eventsError) {
    return NextResponse.json({ error: eventsError.message }, { status: 500 });
  }

  const discrepancies = deriveMissingClockOutDiscrepancies(
    (events ?? []) as ActivityEvent[],
    todayIsoDate()
  );
  const discrepancy = discrepancies.find(
    (item) => item.type === "MISSING_CLOCK_OUT" && item.service_date === serviceDate
  );

  if (!discrepancy) {
    return NextResponse.json({ error: "No open missing clock-out discrepancy found." }, { status: 409 });
  }

  const correctedClockOutDate = new Date(clockOutAt).toISOString().slice(0, 10);

  if (correctedClockOutDate !== serviceDate) {
    return NextResponse.json(
      { error: "Clock-out correction must match the discrepancy service date." },
      { status: 400 }
    );
  }

  const originalClockInMs = new Date(discrepancy.clock_in).getTime();
  const correctedClockOutMs = new Date(clockOutAt).getTime();

  if (correctedClockOutMs <= originalClockInMs) {
    return NextResponse.json(
      { error: "Clock-out time must be after the original clock-in time." },
      { status: 400 }
    );
  }

  if (correctedClockOutMs - originalClockInMs > MAX_CORRECTED_CLOCK_OUT_MS) {
    return NextResponse.json(
      {
        error: `Clock-out correction must be within ${MAX_CORRECTED_CLOCK_OUT_HOURS} hours of the original clock-in time.`,
      },
      { status: 400 }
    );
  }

  const { data: event, error: insertError } = await supabase
    .from("driver_activity_event_v")
    .insert({
      company_id: company.id,
      profile_id: typedAccess?.profile_id ?? null,
      person_id: typedAccess?.person_id ?? null,
      roster_member_id: rosterMemberId,
      service_date: serviceDate,
      event_type: "CLOCK_OUT",
      device_occurred_at: clockOutAt,
      source: "DRIVER_CORRECTION",
      event_payload: {
        correction_type: "MISSING_CLOCK_OUT",
        correction_submitted_at: new Date().toISOString(),
        corrected_by_profile_id: typedAccess?.profile_id ?? null,
        source_surface: "driver_home_discrepancy_card",
        original_clock_in_at: discrepancy.clock_in,
        driver_note: driverNote,
      },
    })
    .select("id, event_type, service_date, occurred_at")
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, event });
}
