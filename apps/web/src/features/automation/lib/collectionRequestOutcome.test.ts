import { describe, expect, it } from "vitest";
import {
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
});
