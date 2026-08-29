import { describe, expect, it } from "vitest";
import {
  buildManifestCollectionPace,
  manifestCollectionPaceFromDayFact,
  summarizeManifestStops,
} from "./manifestCollectionPace";

describe("manifest collection pace", () => {
  it("summarizes manifest completion without retaining stop identity", () => {
    expect(
      summarizeManifestStops([
        { completed: "Y" },
        { completed: "Completed" },
        { completed: "" },
      ])
    ).toEqual({
      total_stop_count: 3,
      completed_stop_count: 2,
      open_stop_count: 1,
    });
  });

  it("derives interval pace from sanitized collection summaries", () => {
    const pace = buildManifestCollectionPace([
      {
        created_at: "2026-08-29T12:00:00Z",
        ingest_metadata_json: {
          ingest: { inserted_stop_count: 80, completed_stop_count: 20 },
        },
      },
      {
        created_at: "2026-08-29T12:15:00Z",
        ingest_metadata_json: {
          ingest: { inserted_stop_count: 80, completed_stop_count: 25 },
        },
      },
    ]);

    expect(pace).toMatchObject({
      capture_count: 2,
      measured_capture_count: 2,
      first_capture_at: "2026-08-29T12:00:00Z",
      last_capture_at: "2026-08-29T12:15:00Z",
      median_cadence_minutes: 15,
    });
    expect(pace.intervals[1]).toMatchObject({
      completed_since_prior: 5,
      minutes_since_prior: 15,
      stops_per_hour: 20,
    });
  });

  it("reports legacy captures without inventing pace", () => {
    const pace = buildManifestCollectionPace([
      {
        created_at: "2026-08-29T12:00:00Z",
        ingest_metadata_json: { ingest: { inserted_stop_count: 80 } },
      },
    ]);
    expect(pace).toMatchObject({
      capture_count: 1,
      measured_capture_count: 0,
      first_capture_at: "2026-08-29T12:00:00Z",
      last_capture_at: "2026-08-29T12:00:00Z",
      median_cadence_minutes: null,
      receipts: [
        {
          captured_at: "2026-08-29T12:00:00Z",
          completed_stops: null,
          total_stops: 80,
        },
      ],
      intervals: [],
    });
  });

  it("restores the durable route-day pace contract without raw receipts", () => {
    expect(
      manifestCollectionPaceFromDayFact({
        capture_count: 3,
        measured_capture_count: 3,
        first_capture_at: "2026-08-29T12:00:00Z",
        last_capture_at: "2026-08-29T12:30:00Z",
        intervals: [
          {
            captured_at: "2026-08-29T12:15:00Z",
            completed_stops: 25,
            total_stops: 80,
            completed_since_prior: 5,
            minutes_since_prior: 15,
            stops_per_hour: 20,
          },
        ],
      })
    ).toMatchObject({
      capture_count: 3,
      measured_capture_count: 3,
      receipts: [],
      intervals: [{ completed_since_prior: 5, stops_per_hour: 20 }],
    });
  });
});
