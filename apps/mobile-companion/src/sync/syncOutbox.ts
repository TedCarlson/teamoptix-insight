import * as Network from "expo-network";
import { Platform } from "react-native";

import { getSupabaseClient } from "../lib/supabase";
import { EdgeOutbox } from "../outbox/database";
import {
  canAttemptNetworkSync,
  parseBatchAcknowledgment,
} from "../outbox/protocol";

export type SyncSummary = {
  online: boolean;
  sessionsAcknowledged: number;
  batchesAcknowledged: number;
  error: string | null;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function syncOutbox(
  outbox: EdgeOutbox,
  tenantKey: string,
): Promise<SyncSummary> {
  const network = await Network.getNetworkStateAsync();
  if (!canAttemptNetworkSync(network)) {
    return {
      online: false,
      sessionsAcknowledged: 0,
      batchesAcknowledged: 0,
      error: null,
    };
  }

  const supabase = getSupabaseClient();
  let sessionsAcknowledged = 0;
  let batchesAcknowledged = 0;

  for (const session of await outbox.pendingSessions(tenantKey)) {
    const result = await supabase.rpc("sync_driver_tracking_session", {
      p_company_slug: session.companySlug,
      p_session: {
        session_id: session.sessionId,
        device_started_at: session.deviceStartedAt,
        device_ended_at: session.deviceEndedAt,
        metadata: {
          app: "INSIGHT_MOBILE_COMPANION",
          platform: Platform.OS.toUpperCase(),
          evidence_class: "DEVICE_LOCATION_OBSERVATION",
          truth_status: "OBSERVATION_ONLY",
        },
      },
    });

    if (result.error) {
      await outbox.markSessionFailed(
        tenantKey,
        session.sessionId,
        result.error.message,
      );
      return {
        online: true,
        sessionsAcknowledged,
        batchesAcknowledged,
        error: result.error.message,
      };
    }
    await outbox.markSessionAcknowledged(tenantKey, session.sessionId);
    sessionsAcknowledged += 1;
  }

  for (const batch of await outbox.pendingBatches(tenantKey)) {
    const result = await supabase.rpc("sync_driver_breadcrumb_batch", {
      p_tracking_session_id: batch.sessionId,
      p_batch: batch.payload,
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

    try {
      const acknowledgment = parseBatchAcknowledgment(
        result.data,
        batch.batchId,
      );
      await outbox.applyAcknowledgment(tenantKey, batch, acknowledgment);
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
