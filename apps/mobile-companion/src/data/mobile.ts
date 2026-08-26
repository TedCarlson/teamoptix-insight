import * as Network from "expo-network";

import type {
  DriverMessage,
  DriverSchedule,
  DriverTimeOffRequest,
  FleetVehicle,
  ScheduleBaseline,
  ScheduleDayFact,
  SchedulePreset,
} from "../domain/mobile";
import { getSupabaseClient, type AccessMembership } from "../lib/supabase";
import { EdgeOutbox } from "../outbox/database";
import type { InspectionSubmissionPayload } from "../outbox/types";
import { syncOutbox } from "../sync/syncOutbox";

const MESSAGE_CACHE_KEY = "messages.v1";
const SCHEDULE_CACHE_KEY = "schedule.v1";
const VEHICLE_CACHE_KEY = "vehicles.v1";
const TIME_OFF_CACHE_KEY = "time-off-requests.v1";

type AccessContext = {
  profile_id?: string | null;
};

type InspectionAuthority = {
  company_slug: string;
  context_key: string;
  access_mode?: string;
  roster_member_id?: string;
};

export type MobileSyncSummary = {
  online: boolean;
  error: string | null;
  inspectionsAcknowledged: number;
  messagesAcknowledged: number;
  timeOffActionsAcknowledged: number;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function loadProfileId() {
  const result = await getSupabaseClient().rpc("access_context");
  if (result.error) throw result.error;
  const profileId = (result.data as AccessContext | null)?.profile_id;
  if (!profileId) throw new Error("Your active Insight profile is unavailable.");
  return profileId;
}

export async function loadDriverMessages(
  membership: AccessMembership,
  profileId: string,
  outbox: EdgeOutbox,
) {
  const supabase = getSupabaseClient();
  try {
    if (membership.access_mode === "ADMIN_DEMO") {
      const demoResult = await supabase.rpc("mobile_companion_demo_messages", {
        p_company_slug: membership.company_slug,
        p_roster_member_id: membership.roster_member_id,
      });
      if (demoResult.error) throw demoResult.error;
      const messages: DriverMessage[] = (demoResult.data ?? []).map((row: {
        id: string;
        title: string;
        body: string;
        requires_ack: boolean;
        published_at: string;
        acknowledged_at: string | null;
      }) => ({
        ...row,
        acknowledged: Boolean(row.acknowledged_at),
      }));
      await outbox.setCachedSurface(membership.context_key, MESSAGE_CACHE_KEY, messages);
      return messages;
    }

    const result = await supabase
      .from("company_message")
      .select("id, title, body, requires_ack, published_at")
      .eq("company_id", membership.company_id)
      .eq("status", "published")
      .is("archived_at", null)
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(50);
    if (result.error) throw result.error;

    const rows = result.data ?? [];
    const messageIds = rows.map((row) => row.id);
    let acknowledgments = new Map<string, string>();
    if (messageIds.length > 0) {
      const ackResult = await supabase
        .from("company_message_ack")
        .select("message_id, acknowledged_at")
        .eq("company_id", membership.company_id)
        .eq("profile_id", profileId)
        .in("message_id", messageIds);
      if (ackResult.error) throw ackResult.error;
      acknowledgments = new Map(
        (ackResult.data ?? []).map((row) => [row.message_id, row.acknowledged_at]),
      );
    }

    const messages: DriverMessage[] = rows.map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      requires_ack: row.requires_ack,
      published_at: row.published_at,
      acknowledged_at: acknowledgments.get(row.id) ?? null,
      acknowledged: acknowledgments.has(row.id),
    }));
    await outbox.setCachedSurface(membership.context_key, MESSAGE_CACHE_KEY, messages);
    return messages;
  } catch (error) {
    const cached = await outbox.cachedSurface<DriverMessage[]>(
      membership.context_key,
      MESSAGE_CACHE_KEY,
    );
    if (cached) return cached;
    throw error;
  }
}

export async function loadDriverSchedule(
  membership: AccessMembership,
  outbox: EdgeOutbox,
) {
  const supabase = getSupabaseClient();
  try {
    const baselineResult = await supabase
      .from("schedule_baseline")
      .select(
        "preset_id, rotation_mode, anchor_date, effective_start, rotation_works_s, rotation_works_u, rotation_works_m, rotation_works_t, rotation_works_w, rotation_works_h, rotation_works_f, default_route_s, default_route_u, default_route_m, default_route_t, default_route_w, default_route_h, default_route_f",
      )
      .eq("company_id", membership.company_id)
      .eq("roster_member_id", membership.roster_member_id)
      .eq("is_active", true)
      .is("effective_end", null)
      .maybeSingle();
    if (baselineResult.error) throw baselineResult.error;
    const baseline = (baselineResult.data as ScheduleBaseline | null) ?? null;

    let preset: SchedulePreset | null = null;
    if (baseline?.preset_id) {
      const presetResult = await supabase
        .from("schedule_preset")
        .select("works_s, works_u, works_m, works_t, works_w, works_h, works_f")
        .eq("company_id", membership.company_id)
        .eq("id", baseline.preset_id)
        .eq("is_active", true)
        .maybeSingle();
      if (presetResult.error) throw presetResult.error;
      preset = (presetResult.data as SchedulePreset | null) ?? null;
    }

    const today = new Date();
    const firstDate = new Date(today.getFullYear(), today.getMonth() - 2, 1);
    const lastDate = new Date(today.getFullYear(), today.getMonth() + 13, 0);
    const factsResult = await supabase
      .from("schedule_day_fact")
      .select("service_date, planned_on, route_name, source_kind")
      .eq("company_id", membership.company_id)
      .eq("roster_member_id", membership.roster_member_id)
      .gte("service_date", firstDate.toISOString().slice(0, 10))
      .lte("service_date", lastDate.toISOString().slice(0, 10))
      .order("service_date");
    if (factsResult.error) throw factsResult.error;

    const schedule: DriverSchedule = {
      baseline,
      preset,
      facts: (factsResult.data as ScheduleDayFact[] | null) ?? [],
    };
    await outbox.setCachedSurface(membership.context_key, SCHEDULE_CACHE_KEY, schedule);
    return schedule;
  } catch (error) {
    const cached = await outbox.cachedSurface<DriverSchedule>(
      membership.context_key,
      SCHEDULE_CACHE_KEY,
    );
    if (cached) return cached;
    throw error;
  }
}

export async function loadDriverTimeOffRequests(
  membership: AccessMembership,
  outbox: EdgeOutbox,
) {
  const supabase = getSupabaseClient();
  const mergePending = async (requests: DriverTimeOffRequest[]) => {
    const pending = await outbox.allPendingTimeOffActions(membership.context_key);
    let merged = [...requests];
    for (const action of pending) {
      if (action.actionType === "WITHDRAW" && action.requestId) {
        merged = merged.map((request) => request.id === action.requestId
          ? { ...request, status: "WITHDRAWN" }
          : request);
        continue;
      }
      if (action.actionType !== "SUBMIT") continue;
      if (merged.some((request) =>
        request.id === action.actionId
        || request.device_submission_id === action.actionId
      )) {
        continue;
      }
      const payload = action.payload as {
        requested_dates: string[];
        request_note: string;
      };
      const dates = payload.requested_dates ?? [];
      if (dates.length === 0) continue;
      merged.push({
        id: `local:${action.actionId}`,
        requested_dates: dates,
        start_date: dates[0],
        end_date: dates[dates.length - 1],
        day_count: dates.length,
        status: "PENDING",
        request_note: payload.request_note || null,
        manager_note: null,
        device_submission_id: action.actionId,
        submitted_at: action.createdAt,
        reviewed_at: null,
        updated_at: action.createdAt,
      });
    }
    return merged;
  };
  try {
    const result = membership.access_mode === "ADMIN_DEMO"
      ? await supabase.rpc("mobile_companion_demo_time_off_requests", {
          p_company_slug: membership.company_slug,
          p_roster_member_id: membership.roster_member_id,
        })
      : await supabase
          .from("driver_time_off_request")
          .select(
            "id, device_submission_id, requested_dates, start_date, end_date, day_count, status, request_note, manager_note, submitted_at, reviewed_at, updated_at",
          )
          .eq("company_id", membership.company_id)
          .eq("roster_member_id", membership.roster_member_id)
          .order("start_date");
    if (result.error) throw result.error;
    const requests = (result.data as DriverTimeOffRequest[] | null) ?? [];
    await outbox.setCachedSurface(membership.context_key, TIME_OFF_CACHE_KEY, requests);
    return mergePending(requests);
  } catch (error) {
    const cached = await outbox.cachedSurface<DriverTimeOffRequest[]>(
      membership.context_key,
      TIME_OFF_CACHE_KEY,
    );
    if (cached) return mergePending(cached);
    throw error;
  }
}

export async function loadFleetVehicles(
  membership: Pick<InspectionAuthority, "company_slug" | "context_key">,
  outbox: EdgeOutbox,
) {
  const result = await getSupabaseClient()
    .from("company_fleet_vehicle_v")
    .select(
      "vehicle_id, unit_number, fedex_vehicle_id, vehicle_class_key, vehicle_type, status, year, make, model, vin, plate_number, primary_route, odometer_miles, open_defect_count",
    )
    .eq("company_slug", membership.company_slug)
    .neq("status", "RETIRED")
    .order("unit_number");
  if (result.error) {
    const cached = await outbox.cachedSurface<FleetVehicle[]>(
      membership.context_key,
      VEHICLE_CACHE_KEY,
    );
    if (cached) return cached;
    throw result.error;
  }
  const vehicles = (result.data as FleetVehicle[] | null) ?? [];
  await outbox.setCachedSurface(membership.context_key, VEHICLE_CACHE_KEY, vehicles);
  return vehicles;
}

async function uploadInspectionEvidence(
  submissionId: string,
  companySlug: string,
  vehicleId: string,
  evidence: Awaited<ReturnType<EdgeOutbox["pendingInspectionSubmissions"]>>[number]["evidence"],
) {
  const supabase = getSupabaseClient();
  const session = await supabase.auth.getSession();
  const accessToken = session.data.session?.access_token;
  if (!accessToken) throw new Error("Your Insight session is unavailable for inspection evidence.");
  const mediaByItem = new Map<string, string[]>();
  const itemIndexes = new Map<string, number>();
  const webAppUrl = (process.env.EXPO_PUBLIC_WEB_APP_URL ?? "https://teamoptix.io").replace(/\/$/, "");

  for (const item of evidence) {
    const index = itemIndexes.get(item.itemKey) ?? 0;
    itemIndexes.set(item.itemKey, index + 1);
    const response = await fetch(`${webAppUrl}/api/company/${encodeURIComponent(companySlug)}/fleet/inspection-evidence`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        base64: item.base64,
        content_type: item.contentType,
        device_submission_id: submissionId,
        item_key: item.itemKey,
        sequence: index,
        sha256: item.sha256,
        size_bytes: item.sizeBytes,
        vehicle_id: vehicleId,
      }),
    });
    const result = await response.json().catch(() => null) as { error?: string; storage_path?: string } | null;
    if (!response.ok || !result?.storage_path) throw new Error(result?.error || "Inspection evidence could not be stored.");
    mediaByItem.set(item.itemKey, [...(mediaByItem.get(item.itemKey) ?? []), result.storage_path]);
  }
  return mediaByItem;
}

async function synchronizeInspectionSubmissions(outbox: EdgeOutbox, authority: InspectionAuthority) {
  const supabase = getSupabaseClient();
  let acknowledged = 0;
  for (const submission of await outbox.pendingInspectionSubmissions(authority.context_key)) {
    try {
      if (authority.access_mode === "ADMIN_DEMO" && authority.roster_member_id) {
        const demoResult = await supabase.rpc("sync_mobile_companion_demo_event", {
          p_company_slug: authority.company_slug,
          p_roster_member_id: authority.roster_member_id,
          p_event_id: submission.submissionId,
          p_event_type: "INSPECTION_SUBMISSION",
          p_payload: {
            inspection: submission.payload,
            evidence: submission.evidence.map((item) => ({ item_key: item.itemKey, content_type: item.contentType, size_bytes: item.sizeBytes, sha256: item.sha256 })),
          },
        });
        if (demoResult.error) throw demoResult.error;
        await outbox.markInspectionAcknowledged(authority.context_key, submission.submissionId, `demo:${submission.submissionId}`);
        acknowledged += 1;
        continue;
      }
      const mediaByItem = await uploadInspectionEvidence(submission.submissionId, submission.companySlug, submission.payload.vehicle_id, submission.evidence);
      const payload: InspectionSubmissionPayload = {
        ...submission.payload,
        items: submission.payload.items.map((item) => ({ ...item, media_paths: mediaByItem.get(item.item_key) ?? [] })),
      };
      const result = await supabase.rpc("submit_mobile_companion_fleet_inspection", {
        p_company_slug: submission.companySlug,
        p_device_submission_id: submission.submissionId,
        p_vehicle_id: payload.vehicle_id,
        p_inspection_type: payload.inspection_type,
        p_odometer_miles: payload.odometer_miles,
        p_safe_to_operate: payload.safe_to_operate,
        p_driver_notes: payload.driver_notes,
        p_route_name: payload.route_name,
        p_items: payload.items,
      });
      if (result.error) throw result.error;
      await outbox.markInspectionAcknowledged(authority.context_key, submission.submissionId, String(result.data));
      acknowledged += 1;
    } catch (error) {
      const nextError = errorMessage(error);
      await outbox.markInspectionFailed(submission, nextError);
      return { acknowledged, error: nextError };
    }
  }
  return { acknowledged, error: null };
}

export async function synchronizeInspectionOutbox(outbox: EdgeOutbox, authority: InspectionAuthority): Promise<MobileSyncSummary> {
  const network = await Network.getNetworkStateAsync();
  if (!network.isConnected || network.isInternetReachable === false) return { online: false, error: null, inspectionsAcknowledged: 0, messagesAcknowledged: 0, timeOffActionsAcknowledged: 0 };
  const result = await synchronizeInspectionSubmissions(outbox, authority);
  return { online: true, error: result.error, inspectionsAcknowledged: result.acknowledged, messagesAcknowledged: 0, timeOffActionsAcknowledged: 0 };
}

export async function synchronizeMobileOutbox(
  outbox: EdgeOutbox,
  membership: AccessMembership,
): Promise<MobileSyncSummary> {
  const network = await Network.getNetworkStateAsync();
  if (!network.isConnected || network.isInternetReachable === false) {
    return {
      online: false,
      error: null,
      inspectionsAcknowledged: 0,
      messagesAcknowledged: 0,
      timeOffActionsAcknowledged: 0,
    };
  }

  const breadcrumb = await syncOutbox(outbox, membership);
  if (breadcrumb.error) {
    return {
      online: true,
      error: breadcrumb.error,
      inspectionsAcknowledged: 0,
      messagesAcknowledged: 0,
      timeOffActionsAcknowledged: 0,
    };
  }

  const supabase = getSupabaseClient();
  const inspectionResult = await synchronizeInspectionSubmissions(outbox, membership);
  let inspectionsAcknowledged = inspectionResult.acknowledged;
  let messagesAcknowledged = 0;
  let timeOffActionsAcknowledged = 0;
  if (inspectionResult.error) return { online: true, error: inspectionResult.error, inspectionsAcknowledged, messagesAcknowledged, timeOffActionsAcknowledged };

  for (const acknowledgment of await outbox.pendingMessageAcknowledgments(
    membership.context_key,
  )) {
    if (membership.access_mode === "ADMIN_DEMO") {
      const result = await supabase.rpc("sync_mobile_companion_demo_event", {
        p_company_slug: membership.company_slug,
        p_roster_member_id: membership.roster_member_id,
        p_event_id: acknowledgment.messageId,
        p_event_type: "MESSAGE_ACKNOWLEDGMENT",
        p_payload: {
          message_id: acknowledgment.messageId,
          queued_at: acknowledgment.queuedAt,
        },
      });
      if (result.error) {
        await outbox.markMessageAcknowledgmentFailed(
          membership.context_key,
          acknowledgment.messageId,
          result.error.message,
        );
        return {
          online: true,
          error: result.error.message,
          inspectionsAcknowledged,
          messagesAcknowledged,
          timeOffActionsAcknowledged,
        };
      }
      await outbox.markMessageAcknowledged(
        membership.context_key,
        acknowledgment.messageId,
      );
      messagesAcknowledged += 1;
      continue;
    }

    const result = await supabase.from("company_message_ack").upsert(
      {
        company_id: membership.company_id,
        message_id: acknowledgment.messageId,
        profile_id: acknowledgment.profileId,
        acknowledged_at: new Date().toISOString(),
      },
      { onConflict: "message_id,profile_id" },
    );
    if (result.error) {
      await outbox.markMessageAcknowledgmentFailed(
        membership.context_key,
        acknowledgment.messageId,
        result.error.message,
      );
      return {
        online: true,
        error: result.error.message,
        inspectionsAcknowledged,
        messagesAcknowledged,
        timeOffActionsAcknowledged,
      };
    }
    await outbox.markMessageAcknowledged(
      membership.context_key,
      acknowledgment.messageId,
    );
    messagesAcknowledged += 1;
  }

  for (const action of await outbox.pendingTimeOffActions(membership.context_key)) {
    try {
      const payload = action.payload as {
        requested_dates?: string[];
        request_note?: string;
        intent_confirmation: Record<string, unknown>;
      };
      const result = action.actionType === "SUBMIT"
        ? membership.access_mode === "ADMIN_DEMO"
          ? await supabase.rpc("submit_mobile_companion_demo_time_off_request", {
              p_company_slug: action.companySlug,
              p_roster_member_id: action.rosterMemberId,
              p_device_submission_id: action.actionId,
              p_requested_dates: payload.requested_dates ?? [],
              p_request_note: payload.request_note ?? "",
              p_intent_confirmation: payload.intent_confirmation,
            })
          : await supabase.rpc("submit_driver_time_off_request", {
              p_company_slug: action.companySlug,
              p_device_submission_id: action.actionId,
              p_requested_dates: payload.requested_dates ?? [],
              p_request_note: payload.request_note ?? "",
              p_intent_confirmation: payload.intent_confirmation,
            })
        : membership.access_mode === "ADMIN_DEMO"
          ? await supabase.rpc("withdraw_mobile_companion_demo_time_off_request", {
              p_company_slug: action.companySlug,
              p_roster_member_id: action.rosterMemberId,
              p_request_id: action.requestId,
              p_device_action_id: action.actionId,
              p_intent_confirmation: payload.intent_confirmation,
            })
          : await supabase.rpc("withdraw_driver_time_off_request", {
              p_company_slug: action.companySlug,
              p_request_id: action.requestId,
              p_device_action_id: action.actionId,
              p_intent_confirmation: payload.intent_confirmation,
            });
      if (result.error) throw result.error;
      const response = result.data as {
        request?: { id?: string };
        request_id?: string;
      } | null;
      const serverRequestId = String(
        response?.request?.id ?? response?.request_id ?? action.requestId ?? action.actionId,
      );
      await outbox.markTimeOffActionAcknowledged(
        membership.context_key,
        action.actionId,
        serverRequestId,
      );
      timeOffActionsAcknowledged += 1;
    } catch (error) {
      const nextError = errorMessage(error);
      await outbox.markTimeOffActionFailed(action, nextError);
      return {
        online: true,
        error: nextError,
        inspectionsAcknowledged,
        messagesAcknowledged,
        timeOffActionsAcknowledged,
      };
    }
  }

  return {
    online: true,
    error: null,
    inspectionsAcknowledged,
    messagesAcknowledged,
    timeOffActionsAcknowledged,
  };
}
