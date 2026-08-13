export const MANIFEST_COLLECTION_ARTIFACT_KEYS = new Set([
  "COMBINED_MANIFEST",
  "DELIVERY_MANIFEST",
  "PICKUP_MANIFEST",
]);

export type DeclaredManifestType = "combined" | "delivery" | "pickup";

export function collectionArtifactKey(row: any) {
  return String(row?.runner_artifact_json?.artifact_key ?? "")
    .trim()
    .toUpperCase();
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

export function canonicalManifestFilename(type: DeclaredManifestType) {
  if (type === "combined") return "Combined Manifest.xlsx";
  if (type === "delivery") return "Delivery Manifest.xlsx";
  return "Pickup Manifest.xlsx";
}

export function isRetryableIngestionTimeout(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /canceling statement due to statement timeout|statement timeout/i.test(
    message
  );
}
