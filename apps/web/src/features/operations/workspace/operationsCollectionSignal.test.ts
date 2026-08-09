import { describe, expect, it } from "vitest";
import { deriveOperationsCollectionSignal } from "./operationsCollectionSignal";

const schedule = {
  collection_enabled: true,
  operations_pulse_enabled: true,
  operations_pulse_start_time: "07:30:00",
  operations_pulse_end_time: "19:30:00",
  runner_state: "APPLIED",
};

describe("deriveOperationsCollectionSignal", () => {
  it("reports the success-chain contract and terminal receipt time", () => {
    const signal = deriveOperationsCollectionSignal({
      now: new Date("2026-08-09T13:07:00Z"),
      operationalDate: "2026-08-09",
      runnerSchedule: schedule,
      operatingCalendar: {
        operating_weekdays: [1, 2, 3, 4, 5, 6],
        operating_date_overrides: { "2026-08-09": "OPERATING" },
      },
      requests: [
        {
          id: "cycle-1",
          request_type: "OPERATIONS_PULSE",
          request_status: "COMPLETE",
          error_message: null,
          claimed_by: "continuous-runner",
          started_at: "2026-08-09T12:34:12Z",
          completed_at: "2026-08-09T12:52:28Z",
          updated_at: "2026-08-09T12:52:28Z",
        },
      ],
    });

    expect(signal).toEqual({
      active: true,
      copy: "Collection Active · next cycle starts on success · last update 8:52 AM",
    });
  });

  it("does not let an unclaimed legacy daily ticket replace runner truth", () => {
    const signal = deriveOperationsCollectionSignal({
      now: new Date("2026-08-09T13:07:00Z"),
      operationalDate: "2026-08-09",
      runnerSchedule: schedule,
      operatingCalendar: {
        operating_date_overrides: { "2026-08-09": "OPERATING" },
      },
      requests: [
        {
          id: "legacy",
          request_type: "OPERATIONS_PULSE",
          request_status: "QUEUED",
          error_message: null,
          claimed_by: null,
          started_at: null,
          completed_at: null,
          updated_at: "2026-08-09T12:30:00Z",
        },
      ],
    });

    expect(signal.copy).toBe(
      "Collection Active · runner released for continuous collection"
    );
  });
});
