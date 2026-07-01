import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type AccessMembership = {
  company_slug?: string | null;
  role_key?: string | null;
};

type AccessContext = {
  profile_id?: string | null;
  person_id?: string | null;
  memberships?: AccessMembership[] | null;
};

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function locationPayload(body: Record<string, unknown>) {
  const location = asObject(body.location);
  const latitude = numberOrNull(location.latitude);
  const longitude = numberOrNull(location.longitude);

  if (latitude == null || longitude == null) return null;

  return {
    latitude,
    longitude,
    accuracy_meters: numberOrNull(location.accuracy_meters),
    device_captured_at:
      typeof location.device_captured_at === "string" && location.device_captured_at.trim()
        ? location.device_captured_at.trim()
        : null,
  };
}

async function resolveCompanyAndAccess(slug: string) {
  const supabase = await getSupabaseServerClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return { supabase, error: NextResponse.json({ error: "Unauthorized." }, { status: 401 }) };
  }

  const { data: access, error: accessError } = await supabase.rpc("access_context");

  if (accessError) {
    return {
      supabase,
      error: NextResponse.json({ error: accessError.message }, { status: 500 }),
    };
  }

  const typedAccess = access as AccessContext | null;
  const membership = typedAccess?.memberships?.find((item) => item.company_slug === slug);

  if (!membership) {
    return { supabase, error: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  }

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id, company_slug")
    .eq("company_slug", slug)
    .single();

  if (companyError || !company) {
    return {
      supabase,
      error: NextResponse.json({ error: "Company not found." }, { status: 404 }),
    };
  }

  return { supabase, company, access: typedAccess, error: null };
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  const body = asObject(await req.json().catch(() => ({})));

  const eventType =
    typeof body.event_type === "string" ? body.event_type.trim().toUpperCase() : "";

  if (!eventType) {
    return NextResponse.json({ error: "event_type is required." }, { status: 400 });
  }

  const resolved = await resolveCompanyAndAccess(slug);

  if (resolved.error) return resolved.error;

  const { supabase, company, access } = resolved;

  const { data: eventTypeRow, error: eventTypeError } = await supabase
    .from("driver_activity_event_type_v")
    .select("event_type, is_active")
    .eq("event_type", eventType)
    .eq("is_active", true)
    .single();

  if (eventTypeError || !eventTypeRow) {
    return NextResponse.json({ error: "Unknown or inactive event_type." }, { status: 400 });
  }

  const serviceDate =
    typeof body.service_date === "string" && body.service_date.trim()
      ? body.service_date.trim()
      : todayIsoDate();

  let rosterMemberId =
    typeof body.roster_member_id === "string" && body.roster_member_id.trim()
      ? body.roster_member_id.trim()
      : null;

  if (!rosterMemberId && access?.profile_id) {
    const { data: rosterRow } = await supabase
      .from("company_roster_view")
      .select("roster_member_id")
      .eq("company_id", company.id)
      .eq("profile_id", access.profile_id)
      .maybeSingle();

    rosterMemberId = rosterRow?.roster_member_id ?? null;
  }

  const insertRow = {
    company_id: company.id,
    profile_id: access?.profile_id ?? null,
    person_id: access?.person_id ?? null,
    roster_member_id: rosterMemberId,
    service_date: serviceDate,
    event_type: eventType,
    device_occurred_at:
      typeof body.device_occurred_at === "string" && body.device_occurred_at.trim()
        ? body.device_occurred_at.trim()
        : null,
    source: "DRIVER_WEB",
    event_payload: asObject(body.event_payload),
  };

  const { data: event, error: insertError } = await supabase
    .from("driver_activity_event_v")
    .insert(insertRow)
    .select("id, event_type, service_date, occurred_at")
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const location = locationPayload(body);

  if (location) {
    const { error: breadcrumbError } = await supabase
      .from("driver_breadcrumb_point_v")
      .insert({
        company_id: company.id,
        profile_id: access?.profile_id ?? null,
        person_id: access?.person_id ?? null,
        roster_member_id: rosterMemberId,
        service_date: serviceDate,
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy_meters: location.accuracy_meters,
        device_captured_at: location.device_captured_at,
        source: "DRIVER_WEB",
        tracking_context: eventType,
        source_activity_event_id: event.id,
        breadcrumb_payload: {
          event_type: eventType,
          source_surface: "driver_home",
        },
      });

    if (breadcrumbError) {
      return NextResponse.json(
        { error: breadcrumbError.message, event },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ ok: true, event, breadcrumb_recorded: Boolean(location) });
}
