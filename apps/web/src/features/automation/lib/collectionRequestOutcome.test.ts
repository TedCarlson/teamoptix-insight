import { describe, expect, it } from "vitest";
import {
  currentAutomationRunFailures,
  currentCollectionRequestExceptions,
  isActiveCollectionRequest,
  isCleanCompleteCollectionRequest,
  isCollectionRequestException,
} from "./collectionRequestOutcome";

describe("collection request outcome classification", () => {
  it("treats artifacts ready as active", () => {
    expect(isActiveCollectionRequest({ request_status: "ARTIFACTS_READY" })).toBe(true);
  });

  it("only classifies error-free completion as clean", () => {
    expect(isCleanCompleteCollectionRequest({ request_status: "COMPLETE", error_message: null })).toBe(true);
    expect(isCleanCompleteCollectionRequest({ request_status: "COMPLETE", error_message: "Partial artifacts registered" })).toBe(false);
  });

  it("surfaces complete-with-error and failed requests as exceptions", () => {
    expect(isCollectionRequestException({ request_status: "COMPLETE", error_message: "Runner exited 1" })).toBe(true);
    expect(isCollectionRequestException({ request_status: "FAILED", error_message: null })).toBe(true);
  });

  it("keeps collection and ingestion outcomes independent", () => {
    expect(isCollectionRequestException({
      request_status: "FAILED",
      error_message: "canceling statement due to statement timeout",
      collection_health: "HEALTHY",
      ingestion_status: "FAILED",
    })).toBe(true);
    expect(isCleanCompleteCollectionRequest({
      request_status: "COMPLETE",
      collection_health: "HEALTHY",
      ingestion_status: "COMPLETE",
    })).toBe(true);
    expect(isCleanCompleteCollectionRequest({
      request_status: "COMPLETE",
      collection_health: "EXCEPTIONS",
      ingestion_status: "COMPLETE",
    })).toBe(false);
  });

  it("closes an older request failure after a later clean completion", () => {
    const attention = currentCollectionRequestExceptions([
      { company_slug: "beacon", request_type: "DRO_AM", request_status: "FAILED", created_at: "2026-08-07T08:00:00Z" },
      { company_slug: "beacon", request_type: "DRO_AM", request_status: "COMPLETE", created_at: "2026-08-07T12:00:00Z" },
    ]);

    expect(attention).toEqual([]);
  });

  it("keeps only the newest unresolved failure per company and automation type", () => {
    const attention = currentCollectionRequestExceptions([
      { id: "older", company_slug: "beacon", request_type: "OPERATIONS_PULSE", request_status: "FAILED", created_at: "2026-08-07T08:00:00Z" },
      { id: "newer", company_slug: "beacon", request_type: "OPERATIONS_PULSE", request_status: "COMPLETE", error_message: "One artifact failed", created_at: "2026-08-07T12:00:00Z" },
      { id: "other", company_slug: "other", request_type: "OPERATIONS_PULSE", request_status: "FAILED", created_at: "2026-08-07T11:00:00Z" },
    ]);

    expect(attention.map((row) => row.id)).toEqual(["newer", "other"]);
  });

  it("closes an older automation-run failure after a later successful run", () => {
    const attention = currentAutomationRunFailures([
      { company_slug: "beacon", automation_type: "COLLECTION", status: "FAILED", started_at: "2026-08-07T08:00:00Z" },
      { company_slug: "beacon", automation_type: "COLLECTION", status: "SUCCEEDED", started_at: "2026-08-07T09:00:00Z" },
    ]);

    expect(attention).toEqual([]);
  });
});
