import { describe, expect, it } from "vitest";
import { completionNeedsWorkspaceRefresh } from "./operationsCollectionRefresh";

describe("completionNeedsWorkspaceRefresh", () => {
  it("refreshes when collection completed after workspace hydration began", () => {
    expect(
      completionNeedsWorkspaceRefresh(
        {
          request_status: "COMPLETE",
          error_message: null,
          completed_at: "2026-08-08T08:01:23.014Z",
        },
        "2026-08-08T08:01:20.000Z"
      )
    ).toBe(true);
  });

  it("does not duplicate a load that began after collection completed", () => {
    expect(
      completionNeedsWorkspaceRefresh(
        {
          request_status: "COMPLETE",
          error_message: null,
          completed_at: "2026-08-08T08:01:23.014Z",
        },
        "2026-08-08T08:02:00.000Z"
      )
    ).toBe(false);
  });

  it("ignores failed and incomplete collections", () => {
    expect(
      completionNeedsWorkspaceRefresh(
        {
          request_status: "COMPLETE",
          error_message: "ingest failed",
          completed_at: "2026-08-08T08:01:23.014Z",
        },
        "2026-08-08T08:01:20.000Z"
      )
    ).toBe(false);

    expect(
      completionNeedsWorkspaceRefresh(
        {
          request_status: "INGESTING",
          error_message: null,
          completed_at: null,
        },
        "2026-08-08T08:01:20.000Z"
      )
    ).toBe(false);
  });
});
