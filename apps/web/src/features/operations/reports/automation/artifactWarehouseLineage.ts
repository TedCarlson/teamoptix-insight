type ArtifactLineageRow = {
  id: string;
  service_date?: string | null;
  collection_request_id?: string | null;
  company_id?: string | null;
  original_filename: string | null;
  normalized_filename: string | null;
  report_family_key: string | null;
  report_shape_key?: string | null;
  runner_key?: string | null;
  runner_artifact_json?: Record<string, unknown> | null;
};

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function conventionSegment(value: string, fallback: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || fallback
  );
}

export function parseRunnerV2TransportFilename(filename: string) {
  const parts = filename.split("__");
  if (parts.length !== 5) {
    throw new Error("Runner 2.0 transport filename has an invalid shape.");
  }
  const [companySlug, requestedServiceDate, sourceLane, declaredType, tail] =
    parts;
  const tailMatch = tail.match(
    /^([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})(\.[a-z0-9]+)$/i
  );
  if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedServiceDate) || !tailMatch) {
    throw new Error("Runner 2.0 transport filename has an invalid identity.");
  }
  return {
    companySlug,
    requestedServiceDate,
    sourceLane,
    declaredType,
    artifactId: tailMatch[1].toLowerCase(),
    extension: tailMatch[2].toLowerCase(),
  };
}

export function artifactKeyFromTransportFilename(filename: string | null) {
  if (!filename) return null;
  try {
    return parseRunnerV2TransportFilename(filename).declaredType
      .replace(/-/g, "_")
      .toUpperCase();
  } catch {
    return null;
  }
}

export function declaredArtifactKey(artifact: ArtifactLineageRow) {
  const runner = artifact.runner_artifact_json ?? {};
  const structured = text(runner.artifact_key)?.toUpperCase();
  if (structured && structured !== "UNKNOWN") return structured;
  return artifactKeyFromTransportFilename(
    text(runner.transport_filename) ?? text(artifact.normalized_filename)
  );
}

export function reportFamilyFromArtifact(artifact: ArtifactLineageRow) {
  const structured = text(artifact.report_family_key)?.toUpperCase();
  if (structured && structured !== "UNKNOWN") return structured;
  const artifactKey = declaredArtifactKey(artifact) ?? "";
  if (artifactKey.startsWith("DSW")) return "DSW";
  if (artifactKey.startsWith("DRO")) return "DRO";
  if (
    artifactKey.startsWith("FCC") ||
    artifactKey === "WORK_AREA_SUMMARY" ||
    artifactKey.endsWith("_MANIFEST")
  ) {
    return "FCC";
  }
  return null;
}

export function artifactWarehouseLineage(params: {
  artifact: ArtifactLineageRow;
  companySlug: string;
}) {
  const { artifact, companySlug } = params;
  const runner = artifact.runner_artifact_json ?? {};
  const sourceFilename =
    text(runner.source_download_filename) ??
    text(artifact.original_filename) ??
    "artifact";
  const transportFilename =
    text(runner.transport_filename) ?? text(artifact.normalized_filename);
  const isRunnerV2 =
    text(runner.handoff_contract) === "operations_artifact_handoff_v2" ||
    text(runner.handoff_mode) === "DIRECT_INGESTION" ||
    Boolean(text(runner.transport_filename));
  const resolvedArtifactKey = declaredArtifactKey(artifact);

  if (isRunnerV2) {
    if (!transportFilename) {
      throw new Error("Runner 2.0 artifact is missing its transport filename.");
    }
    const convention = parseRunnerV2TransportFilename(transportFilename);
    const expectedDate =
      text(runner.requested_service_date) ?? text(artifact.service_date);
    const expectedLane = text(runner.source_lane);
    const expectedType = text(runner.artifact_key);
    const matches =
      convention.companySlug === conventionSegment(companySlug, "unknown-company") &&
      convention.artifactId === artifact.id.toLowerCase() &&
      (!expectedDate || convention.requestedServiceDate === expectedDate) &&
      (!expectedLane ||
        convention.sourceLane === conventionSegment(expectedLane, "unknown-lane")) &&
      (!expectedType ||
        convention.declaredType === conventionSegment(expectedType, "unknown-type"));
    if (!matches) {
      throw new Error(
        "Runner 2.0 transport filename does not match its database artifact identity."
      );
    }
  }

  return {
    warehouseSourceFilename:
      isRunnerV2 && transportFilename ? transportFilename : sourceFilename,
    metadata: {
      contract: "operations_warehouse_artifact_lineage_v1",
      company_id: text(artifact.company_id),
      company_slug: companySlug,
      collection_request_id: text(artifact.collection_request_id),
      artifact_id: artifact.id,
      source_download_filename: sourceFilename,
      transport_filename: transportFilename,
      source_lane: text(runner.source_lane),
      declared_artifact_key: resolvedArtifactKey,
      declared_report_family_key:
        text(runner.report_family_key) ?? text(artifact.report_family_key),
      declared_report_shape_key:
        text(runner.report_shape_key) ?? text(artifact.report_shape_key),
      handoff_contract: text(runner.handoff_contract),
      handoff_mode: text(runner.handoff_mode),
      runner_key: text(artifact.runner_key),
      payload_authority: "INGESTION_PIPELINE",
      filename_routing_authority: false,
      filename_identity_role: isRunnerV2
        ? "LAST_RESORT_RECONCILIATION"
        : null,
      filename_identity_verified: isRunnerV2,
    },
  };
}
