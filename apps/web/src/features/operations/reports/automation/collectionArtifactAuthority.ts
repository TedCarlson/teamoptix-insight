import { declaredArtifactKey } from "./artifactWarehouseLineage";

export const MANIFEST_COLLECTION_ARTIFACT_KEYS = new Set([
  "COMBINED_MANIFEST",
  "DELIVERY_MANIFEST",
  "PICKUP_MANIFEST",
]);

export type DeclaredManifestType = "combined" | "delivery" | "pickup";

export type IngestionManifestIdentity = {
  manifest_type: "delivery" | "pickup";
  service_date: string;
  service_area: string | null;
  route_key: string;
  route_label: string;
  raw_work_area: string;
  source_page: string;
  canonical_filename: string;
};

export function collectionArtifactKey(row: any) {
  return declaredArtifactKey(row) ?? "";
}

export function isManifestCollectionArtifact(row: any) {
  const artifactKey = collectionArtifactKey(row);
  if (MANIFEST_COLLECTION_ARTIFACT_KEYS.has(artifactKey)) return true;

  // Compatibility for artifacts collected before lane metadata was added.
  return [
    "Combined Manifest.xlsx",
    "Delivery Manifest.xlsx",
    "Pickup Manifest.xlsx",
  ].includes(String(row?.normalized_filename ?? ""));
}

export function expectedManifestType(
  row: any
): DeclaredManifestType | null {
  const artifactKey = collectionArtifactKey(row);
  if (artifactKey === "COMBINED_MANIFEST") return "combined";
  if (artifactKey === "DELIVERY_MANIFEST") return "delivery";
  if (artifactKey === "PICKUP_MANIFEST") return "pickup";

  const normalized = String(row?.normalized_filename ?? "");
  if (normalized === "Combined Manifest.xlsx") return "combined";
  if (normalized === "Delivery Manifest.xlsx") return "delivery";
  if (normalized === "Pickup Manifest.xlsx") return "pickup";
  return null;
}

export function manifestPreparationPayload(params: {
  artifact: any;
  identity: IngestionManifestIdentity;
  preparedAt: string;
}) {
  const { artifact, identity, preparedAt } = params;
  const expectedType = expectedManifestType(artifact);
  if (!expectedType || expectedType === "combined") {
    throw new Error(
      "Manifest source lane is unsupported by the ingestion pipeline."
    );
  }
  if (identity.manifest_type !== expectedType) {
    throw new Error(
      `Manifest identity mismatch: artifact expects ${expectedType}, Header identifies ${identity.manifest_type}.`
    );
  }
  if (artifact.service_date && artifact.service_date !== identity.service_date) {
    throw new Error(
      `Manifest identity mismatch: artifact date ${artifact.service_date}, Header date ${identity.service_date}.`
    );
  }

  return {
    serviceDate: identity.service_date,
    originalFilename: identity.canonical_filename,
    // The ingestion-derived canonical name preserves the workbook's actual
    // .xls transport. A display label must never pretend that bytes were
    // converted to .xlsx or become a routing authority.
    normalizedFilename: identity.canonical_filename,
    runnerArtifact: {
      ...(artifact.runner_artifact_json ?? {}),
      artifact_key:
        identity.manifest_type === "delivery"
          ? "DELIVERY_MANIFEST"
          : "PICKUP_MANIFEST",
      manifest_type: identity.manifest_type,
      service_date: identity.service_date,
      service_area: identity.service_area,
      route_key: identity.route_key,
      route_label: identity.route_label,
      header_work_area: identity.raw_work_area,
      header_page: identity.source_page,
      source_download_filename:
        artifact.runner_artifact_json?.source_download_filename ??
        artifact.original_filename,
      canonical_filename: identity.canonical_filename,
      identity_authority: "INGESTION_PIPELINE",
    },
    ingestMetadata: {
      ...(artifact.ingest_metadata_json ?? {}),
      source: "prepare_manifest_collection_artifacts",
      prepared_at: preparedAt,
      identity_authority: "INGESTION_PIPELINE",
      manifest_identity: identity,
    },
  };
}

export function isRetryableIngestionTimeout(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /canceling statement due to statement timeout|statement timeout/i.test(
    message
  );
}
