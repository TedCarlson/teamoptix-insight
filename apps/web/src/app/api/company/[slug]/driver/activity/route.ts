import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

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

function rpcStatus(message: string) {
  if (message.includes("AUTHENTICATION_REQUIRED")) return 401;
  if (
    message.includes("ACTIVE_COMPANY_MEMBERSHIP_REQUIRED") ||
    message.includes("ELIGIBLE_DRIVER_ROSTER_REQUIRED")
  ) {
    return 403;
  }
  if (
    message.includes("UNKNOWN_OR_INACTIVE_DRIVER_EVENT_TYPE") ||
    message.includes("INVALID_") ||
    message.includes("MUST_BE_AN_OBJECT") ||
    message.includes("AMBIGUOUS_DRIVER_ROSTER")
  ) {
    return 400;
  }
  return 500;
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

  const supabase = await getSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { data, error } = await supabase.rpc("record_driver_web_activity", {
    p_company_slug: slug,
    p_event_type: eventType,
    p_device_occurred_at:
      typeof body.device_occurred_at === "string" && body.device_occurred_at.trim()
        ? body.device_occurred_at.trim()
        : null,
    p_event_payload: asObject(body.event_payload),
    p_location: locationPayload(body),
  });

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: rpcStatus(error.message) }
    );
  }

  return NextResponse.json(data);
}
