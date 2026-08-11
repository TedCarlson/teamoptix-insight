import * as Network from "expo-network";
import { Platform } from "react-native";

import { getSupabaseClient, type AccessMembership } from "../lib/supabase";
import { EdgeOutbox } from "../outbox/database";
import { canAttemptNetworkSync } from "../outbox/protocol";

export type SyncSummary = {
  online: boolean;
  sessionsAcknowledged: number;
  batchesAcknowledged: number;
  error: string | null;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function stopDutyEventId(sessionId: string) {
  const last = sessionId.slice(-1).toLowerCase();
  return `${sessionId.slice(0, -1)}${last === "0" ? "1" : "0"}`;
}

async function syncObservationEvent(
  membership: AccessMembership,
  event: {
    eventId: string;
    eventType: "DUTY_STARTED" | "DUTY_STOPPED" | "LOCATION_CAPTURE";
    deviceOccurredAt: string;
    payload: Record<string, unknown>;
  },
) {
  const supabase = getSupabaseClient();
  return membership.access_mode === "ADMIN_DEMO"
    ? supabase.rpc("sync_mobile_companion_demo_event", {
        p_company_slug: membership.company_slug,
        p_roster_member_id: membership.roster_member_id,
        p_event_id: event.eventId,
        p_event_type: event.eventType,
        p_payload: {
          ...event.payload,
          device_occurred_at: event.deviceOccurredAt,
        },
      })
    : supabase.rpc("sync_mobile_companion_observation_event", {
        p_company_slug: membership.company_slug,
        p_event_id: event.eventId,
        p_event_type: event.eventType,
        p_device_occurred_at: event.deviceOccurredAt,
        p_payload: event.payload,
      });
}

export async function syncOutbox(
  outbox: EdgeOutbox,
  membership: AccessMembership,
): Promise<SyncSummary> {
  const tenantKey = membership.context_key;
  const network = await Network.getNetworkStateAsync();
  if (!canAttemptNetworkSync(network)) {
    return {
      online: false,
      sessionsAcknowledged: 0,
      batchesAcknowledged: 0,
      error: null,
    };
  }

  let sessionsAcknowledged = 0;
  let batchesAcknowledged = 0;

  for (const session of await outbox.pendingSessions(tenantKey)) {
    const evidenceMetadata = {
      app: "INSIGHT_MOBILE_COMPANION",
      platform: Platform.OS.toUpperCase(),
      evidence_class: "DEVICE_LOCATION_OBSERVATION",
      truth_status: membership.access_mode === "ADMIN_DEMO"
        ? "ADMIN_DEMO_ONLY"
        : "OBSERVATION_ONLY",
    };
    const startResult = await syncObservationEvent(membership, {
      eventId: session.sessionId,
      eventType: "DUTY_STARTED",
      deviceOccurredAt: session.deviceStartedAt,
      payload: {
        tracking_session_id: session.sessionId,
        action: "START_DUTY",
        metadata: evidenceMetadata,
      },
    });

    if (startResult.error) {
      await outbox.markSessionFailed(
        tenantKey,
        session.sessionId,
        startResult.error.message,
      );
      return {
        online: true,
        sessionsAcknowledged,
        batchesAcknowledged,
        error: startResult.error.message,
      };
    }

    const stopResult = session.deviceEndedAt
      ? await syncObservationEvent(membership, {
          eventId: stopDutyEventId(session.sessionId),
          eventType: "DUTY_STOPPED",
          deviceOccurredAt: session.deviceEndedAt,
          payload: {
            tracking_session_id: session.sessionId,
            action: "STOP_DUTY",
            device_started_at: session.deviceStartedAt,
            metadata: evidenceMetadata,
          },
        })
      : null;

    if (stopResult?.error) {
      await outbox.markSessionFailed(
        tenantKey,
        session.sessionId,
        stopResult.error.message,
      );
      return {
        online: true,
        sessionsAcknowledged,
        batchesAcknowledged,
        error: stopResult.error.message,
      };
    }

    await outbox.markSessionAcknowledged(tenantKey, session.sessionId);
    sessionsAcknowledged += 1;
  }

  for (const batch of await outbox.pendingBatches(tenantKey)) {
    const acceptedPointIds: string[] = [];
    const duplicatePointIds: string[] = [];
    let serverReceivedAt = new Date().toISOString();

    for (const point of batch.payload.points) {
      const result = await syncObservationEvent(membership, {
        eventId: point.point_id,
        eventType: "LOCATION_CAPTURE",
        deviceOccurredAt: point.device_captured_at,
        payload: {
          tracking_session_id: batch.sessionId,
          breadcrumb_batch_id: batch.batchId,
          latitude: point.latitude,
          longitude: point.longitude,
          accuracy_meters: point.accuracy_meters,
          capture_method: point.capture_method,
          metadata: {
            app: "INSIGHT_MOBILE_COMPANION",
            platform: Platform.OS.toUpperCase(),
            evidence_class: "DEVICE_LOCATION_OBSERVATION",
            truth_status: membership.access_mode === "ADMIN_DEMO"
              ? "ADMIN_DEMO_ONLY"
              : "OBSERVATION_ONLY",
          },
        },
      });

      if (result.error) {
        await outbox.markBatchFailed(tenantKey, batch, result.error.message);
        return {
          online: true,
          sessionsAcknowledged,
          batchesAcknowledged,
          error: result.error.message,
        };
      }

      const acknowledgment = result.data as {
        duplicate_event?: boolean;
        server_received_at?: string;
      } | null;
      serverReceivedAt = String(
        acknowledgment?.server_received_at ?? serverReceivedAt,
      );
      if (acknowledgment?.duplicate_event) {
        duplicatePointIds.push(point.point_id);
      } else {
        acceptedPointIds.push(point.point_id);
      }
    }

    try {
      await outbox.applyAcknowledgment(tenantKey, batch, {
        ok: true,
        batch_id: batch.batchId,
        batch_status: "ACKNOWLEDGED",
        duplicate_batch: acceptedPointIds.length === 0,
        accepted_point_ids: acceptedPointIds,
        duplicate_point_ids: duplicatePointIds,
        rejected: [],
        server_received_at: serverReceivedAt,
      });
      batchesAcknowledged += 1;
    } catch (error) {
      const message = errorMessage(error);
      await outbox.markBatchFailed(tenantKey, batch, message);
      return {
        online: true,
        sessionsAcknowledged,
        batchesAcknowledged,
        error: message,
      };
    }
  }

  return {
    online: true,
    sessionsAcknowledged,
    batchesAcknowledged,
    error: null,
  };
}
