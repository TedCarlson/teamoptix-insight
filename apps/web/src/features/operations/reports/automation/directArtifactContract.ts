export const RUNNER_V2_HANDOFF_CONTRACT = "operations_artifact_handoff_v2";

// Vercel Functions reject request bodies above 4.5 MB. Leave room for
// platform framing and headers, and send larger artifacts through the
// established Storage fallback instead.
export const RUNNER_V2_MAX_DIRECT_BYTES = 4_000_000;

export type RunnerV2ArtifactMetadata = {
  contract: typeof RUNNER_V2_HANDOFF_CONTRACT;
  artifact_id: string;
  collection_request_id: string;
  company_id: string;
  company_slug: string;
  runner_key: string;
  requested_service_date: string;
  source_lane: string;
  source_filename: string;
  transport_filename: string;
  artifact_key: string;
  report_family_key: string;
  report_shape_key?: string | null;
  report_frame?: string | null;
  content_type: string;
  size_bytes: number;
  source_hash: string;
  runner_artifact_json?: Record<string, unknown>;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/i;

function requiredText(value: unknown, label: string) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error(`${label} is required.`);
  return text;
}

export function decodeRunnerV2Metadata(encoded: string | null) {
  if (!encoded) throw new Error("Runner 2.0 artifact metadata is required.");

  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    throw new Error("Runner 2.0 artifact metadata is invalid.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Runner 2.0 artifact metadata must be an object.");
  }

  const metadata = value as Record<string, unknown>;
  if (metadata.contract !== RUNNER_V2_HANDOFF_CONTRACT) {
    throw new Error("Unsupported Runner artifact handoff contract.");
  }

  const artifactId = requiredText(metadata.artifact_id, "artifact_id");
  const requestId = requiredText(
    metadata.collection_request_id,
    "collection_request_id"
  );
  const companyId = requiredText(metadata.company_id, "company_id");
  if (![artifactId, requestId, companyId].every((id) => UUID_PATTERN.test(id))) {
    throw new Error("Runner 2.0 identity fields must be UUIDs.");
  }

  const requestedDate = requiredText(
    metadata.requested_service_date,
    "requested_service_date"
  );
  if (!DATE_PATTERN.test(requestedDate)) {
    throw new Error("requested_service_date must be YYYY-MM-DD.");
  }

  const sizeBytes = Number(metadata.size_bytes);
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) {
    throw new Error("size_bytes must be a positive integer.");
  }
  if (sizeBytes > RUNNER_V2_MAX_DIRECT_BYTES) {
    throw new Error("Artifact exceeds the direct-ingestion size limit.");
  }

  const sourceHash = requiredText(metadata.source_hash, "source_hash");
  if (!SHA256_PATTERN.test(sourceHash)) {
    throw new Error("source_hash must be a SHA-256 hex digest.");
  }

  return {
    ...metadata,
    artifact_id: artifactId,
    collection_request_id: requestId,
    company_id: companyId,
    company_slug: requiredText(metadata.company_slug, "company_slug"),
    runner_key: requiredText(metadata.runner_key, "runner_key"),
    requested_service_date: requestedDate,
    source_lane: requiredText(metadata.source_lane, "source_lane"),
    source_filename: requiredText(metadata.source_filename, "source_filename"),
    transport_filename: requiredText(
      metadata.transport_filename,
      "transport_filename"
    ),
    artifact_key: requiredText(metadata.artifact_key, "artifact_key"),
    report_family_key: requiredText(
      metadata.report_family_key,
      "report_family_key"
    ),
    report_shape_key:
      typeof metadata.report_shape_key === "string"
        ? metadata.report_shape_key
        : null,
    report_frame:
      typeof metadata.report_frame === "string" ? metadata.report_frame : null,
    content_type: requiredText(metadata.content_type, "content_type"),
    size_bytes: sizeBytes,
    source_hash: sourceHash.toLowerCase(),
    runner_artifact_json:
      metadata.runner_artifact_json &&
      typeof metadata.runner_artifact_json === "object" &&
      !Array.isArray(metadata.runner_artifact_json)
        ? (metadata.runner_artifact_json as Record<string, unknown>)
        : {},
  } as RunnerV2ArtifactMetadata;
}
