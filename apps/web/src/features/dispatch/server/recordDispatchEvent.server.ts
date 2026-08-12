import { NextResponse } from "next/server";
import { getDispatchRequestContext } from "./resolveDispatchCompany.server";

export async function recordDispatchEvent(
  slug: string,
  body: Record<string, unknown>
) {
  const ctx = await getDispatchRequestContext(slug);
  if ("error" in ctx) return ctx.error;

  const dispatchDate =
    typeof body.dispatch_date === "string"
      ? body.dispatch_date
      : new Date().toISOString().slice(0, 10);

  const eventCode =
    typeof body.event_code === "string" ? body.event_code.trim() : "";

  if (!eventCode) {
    return NextResponse.json({ error: "event_code is required." }, { status: 400 });
  }

  const eventPayload =
    body.event_payload && typeof body.event_payload === "object"
      ? (body.event_payload as Record<string, unknown>)
      : {};
  const actionPhase = body.action_phase === "dispatch" || body.action_phase === "delivery"
    ? body.action_phase
    : null;

  if (eventCode === "PASS_ROUTE_TO_CSA") {
    const routeKey =
      typeof body.route_key === "string" ? body.route_key.trim() : "";
    const receivingCsa =
      typeof eventPayload.receiving_csa === "string"
        ? eventPayload.receiving_csa.trim()
        : "";

    if (!routeKey || !receivingCsa) {
      return NextResponse.json(
        { error: "Route and receiving CSA are required for a route handoff." },
        { status: 400 }
      );
    }
  }

  const rpc = actionPhase ? "mobile_companion_record_manager_action" : "dispatch_record_event";
  const params = actionPhase ? {
    p_company_slug: slug,
    p_phase: actionPhase.toUpperCase(),
    p_event_code: eventCode,
    p_route_key: typeof body.route_key === "string" ? body.route_key : null,
    p_route_label: typeof body.route_label === "string" ? body.route_label : null,
    p_person_roster_member_id:
      typeof body.person_roster_member_id === "string"
        ? body.person_roster_member_id
        : null,
    p_person_name: typeof body.person_name === "string" ? body.person_name : null,
    p_seat: typeof body.seat === "string" ? body.seat : null,
    p_from_route_key:
      typeof body.from_route_key === "string" ? body.from_route_key : null,
    p_from_route_label:
      typeof body.from_route_label === "string" ? body.from_route_label : null,
    p_to_route_key: typeof body.to_route_key === "string" ? body.to_route_key : null,
    p_to_route_label:
      typeof body.to_route_label === "string" ? body.to_route_label : null,
    p_note: typeof body.note === "string" ? body.note : null,
    p_stop_count: typeof eventPayload.stop_count === "number" ? eventPayload.stop_count : null,
    p_event_payload: eventPayload,
  } : {
    p_company_id: ctx.company.id,
    p_dispatch_date: dispatchDate,
    p_event_code: eventCode,
    p_event_label: typeof body.event_label === "string" ? body.event_label : null,
    p_event_category:
      typeof body.event_category === "string" ? body.event_category : null,
    p_route_key: typeof body.route_key === "string" ? body.route_key : null,
    p_route_label: typeof body.route_label === "string" ? body.route_label : null,
    p_seat: typeof body.seat === "string" ? body.seat : null,
    p_person_roster_member_id:
      typeof body.person_roster_member_id === "string"
        ? body.person_roster_member_id
        : null,
    p_person_name: typeof body.person_name === "string" ? body.person_name : null,
    p_from_route_key:
      typeof body.from_route_key === "string" ? body.from_route_key : null,
    p_from_route_label:
      typeof body.from_route_label === "string" ? body.from_route_label : null,
    p_to_route_key: typeof body.to_route_key === "string" ? body.to_route_key : null,
    p_to_route_label:
      typeof body.to_route_label === "string" ? body.to_route_label : null,
    p_note: typeof body.note === "string" ? body.note : null,
    p_event_payload: eventPayload,
    p_created_by_profile_id: ctx.access?.profile_id ?? null,
  };
  const { data, error } = await ctx.supabase.rpc(rpc, params);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ...(data ?? {}) });
}
