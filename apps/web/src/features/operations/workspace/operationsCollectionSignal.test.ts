import { describe, expect, it } from "vitest";
import { deriveOperationsCollectionSignal } from "./operationsCollectionSignal";

const schedule = {
  collection_enabled: true,
  operations_pulse_enabled: true,
  operations_pulse_start_time: "07:30:00",
  operations_pulse_end_time: "19:30:00",
  runner_state: "APPLIED",
  runner_last_seen_at: "2026-08-13T16:20:00Z",
};

describe("deriveOperationsCollectionSignal", () => {
  it("reports three independent authoritative signals", () => {
    const signal = deriveOperationsCollectionSignal({
      now: new Date("2026-08-13T16:27:00Z"),
      latestIngestionSuccessAt: "2026-08-13T16:17:00Z",
      runnerSchedule: schedule,
      requests: [],
    });

    expect(signal.collection).toEqual({
      key: "collection",
      label: "Collection",
      value: "ON",
      detail: "Master gate enabled",
      tone: "active",
    });
    expect(signal.activity).toEqual({
      key: "activity",
      label: "Collection activity",
      value: "READY",
      detail: "Check-in 12:20 PM",
      tone: "active",
    });
    expect(signal.ingestion).toEqual({
      key: "ingestion",
      label: "Ingestion",
      value: "SUCCEEDED",
      detail: "Last receipt 12:17 PM",
      tone: "active",
    });
  });

  it("never lets a legacy pulse window or calendar rewrite an enabled gate", () => {
    const signal = deriveOperationsCollectionSignal({
      now: new Date("2026-08-13T10:00:00Z"),
      operationalDate: "2026-08-13",
      runnerSchedule: {
        ...schedule,
        operations_pulse_enabled: false,
        runner_last_seen_at: "2026-08-13T09:55:00Z",
      },
      operatingCalendar: {
        operating_date_overrides: { "2026-08-13": "CLOSED" },
      },
      requests: [],
    });

    expect(signal.active).toBe(true);
    expect(signal.collection.value).toBe("ON");
    expect(JSON.stringify(signal)).not.toMatch(/paused|next pulse/i);
  });

  it("reports the master gate as off even while an in-flight request drains", () => {
    const signal = deriveOperationsCollectionSignal({
      now: new Date("2026-08-13T16:27:00Z"),
      runnerSchedule: { ...schedule, collection_enabled: false },
      requests: [
        {
          id: "draining-cycle",
          request_type: "OPERATIONS_PULSE",
          request_status: "RUNNING",
          error_message: null,
          claimed_by: "runner-2",
          started_at: "2026-08-13T16:25:00Z",
          completed_at: null,
          updated_at: "2026-08-13T16:25:00Z",
        },
      ],
    });

    expect(signal.collection.value).toBe("OFF");
    expect(signal.activity.value).toBe("COLLECTING");
  });

  it("keeps runner errors out of the collection gate and ingestion signals", () => {
    const signal = deriveOperationsCollectionSignal({
      now: new Date("2026-08-13T16:27:00Z"),
      latestIngestionSuccessAt: "2026-08-13T16:17:00Z",
      runnerSchedule: {
        ...schedule,
        runner_state: "ERROR",
        runner_last_error: "Collector browser disconnected.",
      },
      requests: [],
    });

    expect(signal.collection.value).toBe("ON");
    expect(signal.activity).toMatchObject({
      value: "ATTENTION",
      detail: "Collector browser disconnected.",
      tone: "critical",
    });
    expect(signal.ingestion.value).toBe("SUCCEEDED");
  });

  it("reports stale activity without claiming collection is off", () => {
    const signal = deriveOperationsCollectionSignal({
      now: new Date("2026-08-13T17:20:01Z"),
      runnerSchedule: schedule,
      requests: [],
    });

    expect(signal.collection.value).toBe("ON");
    expect(signal.activity).toMatchObject({
      value: "ATTENTION",
      detail: "Check-in stale · 12:20 PM",
      tone: "critical",
    });
  });

  it("ignores unclaimed legacy tickets as collection activity", () => {
    const signal = deriveOperationsCollectionSignal({
      now: new Date("2026-08-13T16:27:00Z"),
      runnerSchedule: schedule,
      requests: [
        {
          id: "legacy",
          request_type: "OPERATIONS_PULSE",
          request_status: "QUEUED",
          error_message: null,
          claimed_by: null,
          started_at: null,
          completed_at: null,
          updated_at: "2026-08-13T16:25:00Z",
        },
      ],
    });

    expect(signal.activity.value).toBe("READY");
  });
});
