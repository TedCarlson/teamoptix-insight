import type { ManagerAccessContext } from "../domain/access";
import type { ManagerDispatchSnapshot } from "../domain/managerDispatch";
import type {
  ManagerDeliveryActionDraft,
  ManagerRouteEvidenceItem,
  ManagerRouteEvidenceSnapshot,
} from "../domain/managerOperations";
import { validateManagerDeliveryAction } from "../domain/managerOperations";
import { getSupabaseClient } from "../lib/supabase";

type EvidencePayload = {
  service_date?: string | null;
  route_key?: string | null;
  timezone?: string | null;
  health?: Record<string, unknown> | null;
  delivery_stops?: Array<Record<string, unknown>> | null;
  packages?: Array<Record<string, unknown>> | null;
  pickups?: Array<Record<string, unknown>> | null;
};

function text(row: Record<string, unknown>, key: string) {
  return String(row[key] ?? "").trim();
}

function count(row: Record<string, unknown> | null | undefined, key: string) {
  const value = Number(row?.[key] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function truthy(value: unknown) {
  return value === true || ["Y", "YES", "TRUE", "1", "COMPLETED", "COMPLETE"].includes(String(value ?? "").toUpperCase());
}

function address(row: Record<string, unknown>) {
  return ["address_line_1", "address_line_2", "city", "state", "postal_code"]
    .map((key) => text(row, key))
    .filter(Boolean)
    .join(", ");
}

function routeIdentity(row: Record<string, unknown>) {
  return text(row, "sid") || text(row, "st_number") || address(row).toUpperCase();
}

function deliveryItems(
  stops: Array<Record<string, unknown>>,
  packages: Array<Record<string, unknown>>,
): ManagerRouteEvidenceItem[] {
  return stops.map((stop, index) => {
    const identity = routeIdentity(stop);
    const linkedPackages = packages.filter((item) => routeIdentity(item) === identity);
    const tags = [
      linkedPackages.some((item) => truthy(item.is_express)) ? "Express" : null,
      linkedPackages.some((item) => truthy(item.is_signature)) ? "Signature" : null,
      linkedPackages.some((item) => truthy(item.is_hazmat)) ? "Hazmat" : null,
      linkedPackages.some((item) => truthy(item.is_collection)) ? "Collection" : null,
    ].filter((value): value is string => Boolean(value));
    const complete = truthy(stop.completed) || linkedPackages.length > 0 && linkedPackages.every((item) => String(item.delivery_evidence_state ?? "").toUpperCase() === "COMPLETED");
    const attention = !text(stop, "sid") || linkedPackages.some((item) => {
      const state = String(item.delivery_evidence_state ?? "").toUpperCase();
      return state && !["OPEN", "CODED_ATTEMPT", "COMPLETED"].includes(state);
    });
    const sequence = Number.parseInt(text(stop, "st_number").replace(/\D/g, ""), 10);
    return {
      id: `delivery-${identity || index}-${index}`,
      kind: "delivery",
      sequence: Number.isFinite(sequence) ? sequence : index + 1,
      title: `Stop ${text(stop, "st_number") || index + 1}${text(stop, "recipient") ? ` · ${text(stop, "recipient")}` : ""}`,
      subtitle: text(stop, "sid") ? `SID ${text(stop, "sid")}` : "Manifest identity needs review",
      address: address(stop) || "Address unavailable",
      window: [text(stop, "delivery_time_begin"), text(stop, "delivery_time_end")].filter(Boolean).join("–") || "No committed window",
      packageCount: linkedPackages.length || count(stop, "package_count"),
      expectedPackageCount: null,
      status: attention ? "attention" : complete ? "complete" : "open",
      tags,
    };
  });
}

function pickupItems(rows: Array<Record<string, unknown>>): ManagerRouteEvidenceItem[] {
  return rows.map((pickup, index) => {
    const actual = count(pickup, "packages_picked_up");
    const expected = count(pickup, "package_count_expected");
    const complete = expected > 0 ? actual >= expected : truthy(pickup.pu_closed_at);
    const sequence = Number.parseInt(text(pickup, "pickup_list").replace(/\D/g, ""), 10);
    return {
      id: `pickup-${text(pickup, "puid") || index}`,
      kind: "pickup",
      sequence: Number.isFinite(sequence) ? 10000 + sequence : 10000 + index,
      title: `${text(pickup, "shipper_name") || "Pickup"} · Pickup`,
      subtitle: [text(pickup, "puid") ? `PUID ${text(pickup, "puid")}` : null, text(pickup, "pickup_type")].filter(Boolean).join(" · ") || "Pickup evidence",
      address: address(pickup) || "Address unavailable",
      window: [text(pickup, "ready_at"), text(pickup, "close_at")].filter(Boolean).join("–") || "No committed window",
      packageCount: actual,
      expectedPackageCount: expected,
      status: complete ? "complete" : "open",
      tags: [],
    };
  });
}

export async function loadManagerRouteEvidence(
  context: ManagerAccessContext,
  routeKey: string,
): Promise<ManagerRouteEvidenceSnapshot> {
  const result = await getSupabaseClient().rpc("mobile_companion_operations_route_evidence", {
    p_company_slug: context.company_slug,
    p_route_key: routeKey,
  });
  if (result.error) throw result.error;
  const payload = (result.data ?? {}) as EvidencePayload;
  const health = payload.health ?? null;
  const items = [
    ...deliveryItems(payload.delivery_stops ?? [], payload.packages ?? []),
    ...pickupItems(payload.pickups ?? []),
  ].sort((left, right) => left.sequence - right.sequence);
  return {
    serviceDate: String(payload.service_date ?? ""),
    routeKey: String(payload.route_key ?? routeKey),
    timeZone: String(payload.timezone ?? "UTC"),
    summary: {
      deliveryStops: count(health, "delivery_stop_count"),
      completedStops: count(health, "completed_delivery_stop_count"),
      packages: count(health, "delivery_package_count") || (payload.packages ?? []).length,
      pickups: count(health, "pickup_stop_count") || (payload.pickups ?? []).length,
      express: count(health, "express_package_count"),
      attention: items.filter((item) => item.status === "attention").length,
      severity: health ? text(health, "route_health_severity") || null : null,
      status: health ? text(health, "route_health_status") || null : null,
      asOf: health ? text(health, "latest_processed_at") || text(health, "latest_captured_at") || null : null,
    },
    items,
  };
}

export async function recordManagerDeliveryAction(
  context: ManagerAccessContext,
  snapshot: ManagerDispatchSnapshot,
  draft: ManagerDeliveryActionDraft,
) {
  const validation = validateManagerDeliveryAction(draft);
  if (validation) throw new Error(validation);
  const assistingRoute = snapshot.routes.find((route) => route.id === draft.assistingRouteId) ?? null;
  const receivingRoute = snapshot.routes.find((route) => route.id === draft.receivingRouteId) ?? null;
  const result = await getSupabaseClient().rpc("mobile_companion_record_manager_action", {
    p_company_slug: context.company_slug,
    p_phase: "DELIVERY",
    p_event_code: draft.code,
    p_route_key: null,
    p_route_label: null,
    p_person_roster_member_id: null,
    p_person_name: null,
    p_seat: null,
    p_note: draft.note.trim() || null,
    p_from_route_key: assistingRoute?.dispatchRouteKey ?? null,
    p_from_route_label: assistingRoute ? [assistingRoute.routeName, assistingRoute.workArea].filter(Boolean).join(" · ") : null,
    p_to_route_key: receivingRoute?.dispatchRouteKey ?? null,
    p_to_route_label: receivingRoute ? [receivingRoute.routeName, receivingRoute.workArea].filter(Boolean).join(" · ") : null,
    p_stop_count: draft.code === "DRIVER_ASSIST" ? Number(draft.stopCount) : null,
    p_event_payload: { source: "mobile_delivery_action_overlay" },
  });
  if (result.error) throw result.error;
  return result.data;
}
