import { describe, expect, it } from "vitest";
import {
  canonicalManifestFilename,
  expectedManifestType,
  isManifestCollectionArtifact,
  isRetryableIngestionTimeout,
} from "./collectionArtifactAuthority";

describe("collection artifact authority", () => {
  it("routes opaque manifests by runner source-lane metadata", () => {
    const artifact = {
      normalized_filename: "DeliveryManifest (3).xls",
      runner_artifact_json: { artifact_key: "DELIVERY_MANIFEST" },
    };

    expect(isManifestCollectionArtifact(artifact)).toBe(true);
    expect(expectedManifestType(artifact)).toBe("delivery");
  });

  it("keeps workbook identity out of runner routing metadata", () => {
    const artifact = {
      normalized_filename: "opaque.xls",
      runner_artifact_json: { artifact_key: "DSW_DAILY_SERVICE" },
    };

    expect(isManifestCollectionArtifact(artifact)).toBe(false);
    expect(expectedManifestType(artifact)).toBeNull();
  });

  it("canonicalizes only after ingestion resolves manifest identity", () => {
    expect(canonicalManifestFilename("pickup")).toBe(
      "Pickup Manifest.xlsx"
    );
  });

  it("recognizes database statement timeouts as retryable ingestion errors", () => {
    expect(
      isRetryableIngestionTimeout(
        new Error("canceling statement due to statement timeout")
      )
    ).toBe(true);
    expect(isRetryableIngestionTimeout(new Error("invalid workbook"))).toBe(
      false
    );
  });
});
