import { describe, expect, it } from "vitest";
import {
  expectedManifestType,
  isManifestCollectionArtifact,
  isRetryableIngestionTimeout,
  manifestPreparationPayload,
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

  it("persists Header-derived identity as ingestion-authoritative", () => {
    const payload = manifestPreparationPayload({
      artifact: {
        service_date: "2026-08-13",
        original_filename: "PickupManifest (11).xls",
        runner_artifact_json: {
          artifact_key: "PICKUP_MANIFEST",
          collection_context: { selected_work_area: "486 BPV 17" },
        },
      },
      identity: {
        manifest_type: "pickup",
        service_date: "2026-08-13",
        service_area: "309747",
        route_key: "486",
        route_label: "BPV 17",
        raw_work_area: "0486 BPV 17",
        source_page: "Pickup Manifest",
        canonical_filename: "PM20260813_309747_0486.xls",
      },
      preparedAt: "2026-08-13T14:30:00.000Z",
    });

    expect(payload.originalFilename).toBe("PM20260813_309747_0486.xls");
    expect(payload.normalizedFilename).toBe("PM20260813_309747_0486.xls");
    expect(payload.runnerArtifact).toMatchObject({
      manifest_type: "pickup",
      route_key: "486",
      identity_authority: "INGESTION_PIPELINE",
      source_download_filename: "PickupManifest (11).xls",
    });
    expect(payload.ingestMetadata).toMatchObject({
      identity_authority: "INGESTION_PIPELINE",
      manifest_identity: { route_key: "486" },
    });
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
