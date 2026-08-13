import { describe, expect, it } from "vitest";
import {
  decodeRunnerV2Metadata,
  RUNNER_V2_HANDOFF_CONTRACT,
  RUNNER_V2_MAX_DIRECT_BYTES,
} from "./directArtifactContract";

function encoded(overrides: Record<string, unknown> = {}) {
  return Buffer.from(
    JSON.stringify({
      contract: RUNNER_V2_HANDOFF_CONTRACT,
      artifact_id: "7bb90e2a-ff29-43d7-93ab-7869d021cad0",
      collection_request_id: "a91c2d5f-06fa-47bc-9c88-f1653db70cb3",
      company_id: "842f6d90-214a-4a18-bb30-10b3f9423bd1",
      company_slug: "acme-ground",
      runner_key: "runner-acme-01",
      requested_service_date: "2026-08-13",
      source_lane: "FCC_PICKUP_MANIFESTS",
      source_filename: "PickupManifest (11).xls",
      transport_filename:
        "2026-08-13__fcc-pickup-manifests__7bb90e2a-ff29-43d7-93ab-7869d021cad0.xls",
      artifact_key: "PICKUP_MANIFEST",
      report_family_key: "FCC",
      content_type: "application/vnd.ms-excel",
      size_bytes: 128_000,
      source_hash: "a".repeat(64),
      ...overrides,
    }),
    "utf8"
  ).toString("base64url");
}

describe("Runner 2.0 direct artifact contract", () => {
  it("preserves tenant, lane, source, and transport identities", () => {
    expect(decodeRunnerV2Metadata(encoded())).toMatchObject({
      company_slug: "acme-ground",
      source_lane: "FCC_PICKUP_MANIFESTS",
      source_filename: "PickupManifest (11).xls",
      artifact_key: "PICKUP_MANIFEST",
    });
  });

  it("rejects payloads that belong on the Storage fallback", () => {
    expect(() =>
      decodeRunnerV2Metadata(
        encoded({ size_bytes: RUNNER_V2_MAX_DIRECT_BYTES + 1 })
      )
    ).toThrow("direct-ingestion size limit");
  });

  it("rejects malformed tenant identity before ingestion", () => {
    expect(() =>
      decodeRunnerV2Metadata(encoded({ company_id: "acme" }))
    ).toThrow("must be UUIDs");
  });
});
