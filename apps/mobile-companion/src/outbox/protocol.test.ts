import appConfig from "../../app.json";

import {
  assertTenantBatch,
  canAttemptNetworkSync,
  parseBatchAcknowledgment,
  pointDisposition,
  recoverPendingBatch,
} from "./protocol";
import type { BreadcrumbBatchPayload } from "./types";

const payload: BreadcrumbBatchPayload = {
  batch_id: "22222222-2222-4222-8222-222222222222",
  device_created_at: "2026-08-09T12:05:00.000Z",
  points: [
    {
      point_id: "11111111-1111-4111-8111-111111111111",
      device_captured_at: "2026-08-09T12:04:00.000Z",
      latitude: 39.9526,
      longitude: -75.1652,
      accuracy_meters: 10,
      capture_method: "SYNTHETIC_TEST",
    },
    {
      point_id: "33333333-3333-4333-8333-333333333333",
      device_captured_at: "2026-08-09T12:04:30.000Z",
      latitude: 39.9527,
      longitude: -75.1651,
      accuracy_meters: 12,
      capture_method: "SYNTHETIC_TEST",
    },
  ],
};

describe("MC-1 Edge Outbox protocol", () => {
  it("does not attempt synchronization while offline", () => {
    expect(
      canAttemptNetworkSync({
        isConnected: false,
        isInternetReachable: false,
      }),
    ).toBe(false);
    expect(
      canAttemptNetworkSync({
        isConnected: true,
        isInternetReachable: true,
      }),
    ).toBe(true);
  });

  it("recovers an immutable pending batch after persistence and restart", () => {
    const recovered = recoverPendingBatch({
      batch_id: payload.batch_id,
      session_id: "44444444-4444-4444-8444-444444444444",
      tenant_key: "tenant-a",
      payload_json: JSON.stringify(payload),
      attempt_count: 2,
      next_attempt_at: "2026-08-09T12:06:00.000Z",
    });

    expect(recovered.payload).toEqual(payload);
    expect(recovered.attemptCount).toBe(2);
    expect(recovered.payload.points.map((point) => point.point_id)).toEqual([
      "11111111-1111-4111-8111-111111111111",
      "33333333-3333-4333-8333-333333333333",
    ]);
  });

  it("applies explicit partial-failure point dispositions", () => {
    const acknowledgment = parseBatchAcknowledgment(
      {
        ok: true,
        batch_id: payload.batch_id,
        batch_status: "PARTIAL",
        duplicate_batch: false,
        accepted_point_ids: [payload.points[0].point_id],
        duplicate_point_ids: [],
        rejected: [
          {
            point_id: payload.points[1].point_id,
            code: "INVALID_POINT",
            retryable: false,
          },
        ],
        server_received_at: "2026-08-09T12:07:00.000Z",
      },
      payload.batch_id,
    );

    expect(pointDisposition(acknowledgment, payload.points[0].point_id)).toBe(
      "ACKNOWLEDGED",
    );
    expect(pointDisposition(acknowledgment, payload.points[1].point_id)).toBe(
      "REJECTED",
    );
  });

  it("treats a duplicate batch acknowledgment as success without changing ids", () => {
    const acknowledgment = parseBatchAcknowledgment(
      {
        ok: true,
        batch_id: payload.batch_id,
        batch_status: "ACKNOWLEDGED",
        duplicate_batch: true,
        accepted_point_ids: [],
        duplicate_point_ids: payload.points.map((point) => point.point_id),
        rejected: [],
        server_received_at: "2026-08-09T12:07:00.000Z",
      },
      payload.batch_id,
    );

    expect(acknowledgment.duplicate_batch).toBe(true);
    expect(
      payload.points.every(
        (point) => pointDisposition(acknowledgment, point.point_id) === "ACKNOWLEDGED",
      ),
    ).toBe(true);
  });

  it("blocks cross-tenant queue application", () => {
    expect(() => assertTenantBatch("tenant-b", "tenant-a", payload)).toThrow(
      "Tenant isolation violation",
    );
  });

  it("keeps background location disabled on iOS and Android", () => {
    const locationPlugin = appConfig.expo.plugins.find(
      (plugin) => Array.isArray(plugin) && plugin[0] === "expo-location",
    );
    expect(locationPlugin).toEqual([
      "expo-location",
      expect.objectContaining({
        isIosBackgroundLocationEnabled: false,
        isAndroidBackgroundLocationEnabled: false,
        isAndroidForegroundServiceEnabled: false,
      }),
    ]);
  });
});
