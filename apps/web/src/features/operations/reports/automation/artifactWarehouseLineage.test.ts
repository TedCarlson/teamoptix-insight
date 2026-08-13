import { describe, expect, it } from "vitest";
import { artifactWarehouseLineage } from "./artifactWarehouseLineage";

describe("artifactWarehouseLineage", () => {
  it("uses the Runner 2 transport convention for warehouse display and preserves source evidence", () => {
    const lineage = artifactWarehouseLineage({
      companySlug: "acme-ground",
      artifact: {
        id: "7bb90e2a-ff29-43d7-93ab-7869d021cad0",
        service_date: "2026-08-13",
        company_id: "842f6d90-214a-4a18-bb30-10b3f9423bd1",
        collection_request_id: "a91c2d5f-06fa-47bc-9c88-f1653db70cb3",
        original_filename: "PickupManifest (11).xls",
        normalized_filename:
          "acme-ground__2026-08-13__fcc-pickup-manifests__pickup-manifest__7bb90e2a-ff29-43d7-93ab-7869d021cad0.xls",
        report_family_key: "FCC",
        report_shape_key: null,
        runner_key: "runner-acme-01",
        runner_artifact_json: {
          handoff_contract: "operations_artifact_handoff_v2",
          handoff_mode: "DIRECT_INGESTION",
          artifact_key: "PICKUP_MANIFEST",
          source_lane: "FCC_PICKUP_MANIFESTS",
          requested_service_date: "2026-08-13",
          source_download_filename: "PickupManifest (11).xls",
          transport_filename:
            "acme-ground__2026-08-13__fcc-pickup-manifests__pickup-manifest__7bb90e2a-ff29-43d7-93ab-7869d021cad0.xls",
        },
      },
    });

    expect(lineage.warehouseSourceFilename).toContain("acme-ground__2026-08-13");
    expect(lineage.metadata).toMatchObject({
      company_slug: "acme-ground",
      source_download_filename: "PickupManifest (11).xls",
      declared_artifact_key: "PICKUP_MANIFEST",
      source_lane: "FCC_PICKUP_MANIFESTS",
      payload_authority: "INGESTION_PIPELINE",
      filename_routing_authority: false,
      filename_identity_role: "LAST_RESORT_RECONCILIATION",
      filename_identity_verified: true,
    });
  });

  it("fails closed when the convention points at another company", () => {
    expect(() =>
      artifactWarehouseLineage({
        companySlug: "acme-ground",
        artifact: {
          id: "7bb90e2a-ff29-43d7-93ab-7869d021cad0",
          service_date: "2026-08-13",
          original_filename: "generic.xls",
          normalized_filename:
            "other-company__2026-08-13__dsw-daily__dsw__7bb90e2a-ff29-43d7-93ab-7869d021cad0.xls",
          report_family_key: "DSW",
          runner_artifact_json: {
            handoff_contract: "operations_artifact_handoff_v2",
            artifact_key: "DSW",
            source_lane: "DSW_DAILY",
          },
        },
      })
    ).toThrow(/does not match its database artifact identity/);
  });

  it("preserves the established filename for legacy artifacts", () => {
    const lineage = artifactWarehouseLineage({
      companySlug: "acme-ground",
      artifact: {
        id: "legacy-artifact",
        original_filename: "Daily Service Worksheet.xls",
        normalized_filename: "Daily Service Worksheet.xlsx",
        report_family_key: "DSW",
        runner_artifact_json: {},
      },
    });

    expect(lineage.warehouseSourceFilename).toBe("Daily Service Worksheet.xls");
  });
});
