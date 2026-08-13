import {
  deliveryManifestSheetsFromWorkbook,
  parseDeliveryManifest,
  parsePickupManifest,
  pickupManifestSheetsFromWorkbook,
  readManifestWorkbook,
} from "@/features/operations/manifests";
import {
  dedupeDeliveryManifestPackages,
  dedupeDeliveryManifestStops,
} from "@/features/operations/manifests/deliveryManifest.dedupe";
import { trackingReference } from "@/features/operations/reports/dsw/packageStatus/packageStatus.crypto";
import { packageEvidenceConfigurationAvailable } from "@/features/operations/reports/dsw/packageStatus/packageStatus.evidence";

type SupabaseClientLike = any;

type ManifestArtifactRow = {
  id: string;
  capture_plan_id: string;
  capture_plan_route_id: string;
  company_id: string;
  company_slug: string;
  service_date: string;
  route_key: string;
  route_label: string;
  manifest_type: "delivery" | "pickup" | string;
  artifact_status: string;
  storage_bucket: string;
  storage_path: string;
  original_filename: string;
  normalized_filename: string;
  content_type: string | null;
  size_bytes: number | null;
  source_hash: string | null;
  runner_key: string | null;
  captured_at: string;
  processed_at: string | null;
  metadata_json: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

type ManifestProcessorResult = {
  artifact_id: string;
  manifest_type: string;
  status: "NORMALIZED" | "FAILED";
  route_status?: string | null;
  inserted_stop_count?: number;
  inserted_package_count?: number;
  inserted_pickup_count?: number;
  error?: string;
};

function mergeMetadata(
  artifact: ManifestArtifactRow,
  metadata: Record<string, unknown>
) {
  return {
    ...(artifact.metadata_json ?? {}),
    ...metadata,
  };
}

async function updateArtifactStatus(params: {
  supabase: SupabaseClientLike;
  artifact: ManifestArtifactRow;
  status: "VALIDATING" | "PARSING" | "NORMALIZED" | "FAILED";
  metadata?: Record<string, unknown>;
  errorMessage?: string | null;
}) {
  const { supabase, artifact, status, metadata = {}, errorMessage = null } = params;

  const { error } = await supabase.rpc("update_operations_manifest_artifact_status", {
    p_artifact_id: artifact.id,
    p_artifact_status: status,
    p_metadata_json: metadata,
    p_error_message: errorMessage,
  });

  if (error) throw new Error(error.message);
}

async function downloadManifestArtifact(
  supabase: SupabaseClientLike,
  artifact: ManifestArtifactRow
) {
  const { data, error } = await supabase.storage
    .from(artifact.storage_bucket)
    .download(artifact.storage_path);

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Manifest artifact download returned no data.");
  }

  return Buffer.from(await data.arrayBuffer());
}


async function reconcileRouteStatus(params: {
  supabase: SupabaseClientLike;
  artifact: ManifestArtifactRow;
}) {
  const { supabase, artifact } = params;

  const { data: route, error: routeError } = await supabase
    .from("operations_manifest_capture_plan_route_v")
    .select("*")
    .eq("id", artifact.capture_plan_route_id)
    .single();

  if (routeError) {
    throw new Error(routeError.message);
  }

  const { data: artifacts, error: artifactError } = await supabase
    .from("operations_manifest_artifact_v")
    .select("manifest_type, artifact_status")
    .eq("capture_plan_route_id", artifact.capture_plan_route_id);

  if (artifactError) {
    throw new Error(artifactError.message);
  }

  const rows = artifacts ?? [];
  const requiredTypes = [
    route.delivery_manifest_requested ? "delivery" : null,
    route.pickup_manifest_requested ? "pickup" : null,
  ].filter(Boolean) as string[];

  const normalizedTypes = new Set(
    rows
      .filter((row: any) => row.artifact_status === "NORMALIZED")
      .map((row: any) => row.manifest_type)
  );

  const failedTypes = new Set(
    rows
      .filter((row: any) => row.artifact_status === "FAILED")
      .map((row: any) => row.manifest_type)
  );

  const allRequiredNormalized = requiredTypes.every((type) => normalizedTypes.has(type));
  const anyRequiredFailed = requiredTypes.some((type) => failedTypes.has(type));

  const nextStatus = allRequiredNormalized
    ? "COMPLETE"
    : anyRequiredFailed
      ? normalizedTypes.size > 0
        ? "PARTIAL"
        : "FAILED"
      : route.route_status;

  if (nextStatus !== route.route_status) {
    const { error } = await supabase.rpc(
      "update_operations_manifest_capture_route_status",
      {
        p_capture_plan_route_id: artifact.capture_plan_route_id,
        p_route_status: nextStatus,
        p_error_message:
          nextStatus === "FAILED" || nextStatus === "PARTIAL"
            ? "One or more manifest artifacts failed processing."
            : null,
        p_metadata_json: {
          source: "manifest_artifact_processor",
          normalized_manifest_types: Array.from(normalizedTypes),
          failed_manifest_types: Array.from(failedTypes),
        },
      }
    );

    if (error) throw new Error(error.message);
  }

  return nextStatus;
}

async function reconcilePlanStatus(params: {
  supabase: SupabaseClientLike;
  capturePlanId: string;
}) {
  const { supabase, capturePlanId } = params;

  const { data: routes, error } = await supabase
    .from("operations_manifest_capture_plan_route_v")
    .select("route_status")
    .eq("capture_plan_id", capturePlanId);

  if (error) throw new Error(error.message);

  const rows = routes ?? [];
  if (rows.length === 0) return null;

  const allComplete = rows.every((row: any) => row.route_status === "COMPLETE");
  const allTerminal = rows.every((row: any) =>
    ["COMPLETE", "FAILED", "PARTIAL", "SKIPPED"].includes(row.route_status)
  );
  const anyComplete = rows.some((row: any) => row.route_status === "COMPLETE");
  const anyPartial = rows.some((row: any) => row.route_status === "PARTIAL");

  const nextStatus = allComplete
    ? "COMPLETE"
    : allTerminal && (anyComplete || anyPartial)
      ? "COMPLETE"
      : allTerminal
        ? "FAILED"
        : "PROCESSING";

  const { error: updateError } = await supabase.rpc(
    "update_operations_manifest_capture_plan_status",
    {
      p_capture_plan_id: capturePlanId,
      p_plan_status: nextStatus,
      p_error_message:
        nextStatus === "FAILED"
          ? "All manifest capture routes failed processing."
          : null,
      p_metadata_json: {
        source: "manifest_artifact_processor",
        reconciled_at: new Date().toISOString(),
      },
    }
  );

  if (updateError) throw new Error(updateError.message);

  return nextStatus;
}

async function processDeliveryArtifact(params: {
  supabase: SupabaseClientLike;
  artifact: ManifestArtifactRow;
  buffer: Buffer;
}) {
  const { supabase, artifact, buffer } = params;
  const workbook = readManifestWorkbook(buffer);
  const parsed = parseDeliveryManifest(deliveryManifestSheetsFromWorkbook(workbook));
  const stopRows = dedupeDeliveryManifestStops(parsed.stopDetail.rows);
  const packageRows = dedupeDeliveryManifestPackages(parsed.packageDetail.rows);

  const { data: replaceResult, error: replaceError } = await supabase.rpc(
    "replace_operations_delivery_manifest_rows",
    {
      p_artifact_id: artifact.id,
      p_stop_rows: stopRows.rows,
      p_package_rows: packageRows.rows,
    }
  );

  if (replaceError) throw new Error(replaceError.message);

  let attachedTrackingReferenceCount = 0;
  if (packageEvidenceConfigurationAvailable()) {
    const referenceRows = packageRows.rows
      .filter((row) => Boolean(row.tracking_id?.trim()))
      .map((row) => ({
        tracking_id: row.tracking_id.trim(),
        ...trackingReference({
          companyId: artifact.company_id,
          trackingId: row.tracking_id,
        }),
      }));
    const { data: attachedCount, error: referenceError } = await supabase.rpc(
      "attach_operations_delivery_manifest_tracking_refs",
      { p_artifact_id: artifact.id, p_rows: referenceRows }
    );
    if (referenceError) throw new Error(referenceError.message);
    attachedTrackingReferenceCount = Number(attachedCount ?? 0);
  }

  const { error: snapshotError } = await supabase.rpc(
    "record_operations_express_progress_snapshot",
    {
      p_company_id: artifact.company_id,
      p_service_date: artifact.service_date,
      p_source_family: "DELIVERY_MANIFEST",
      p_source_reference: artifact.id,
    }
  );
  if (snapshotError) throw new Error(snapshotError.message);

  return {
    inserted_stop_count: Number(replaceResult?.delivery_stop_count ?? 0),
    inserted_package_count: Number(replaceResult?.delivery_package_count ?? 0),
    metadata: parsed.metadata,
    stop_detail: {
      parsed_row_count: parsed.stopDetail.parsedRowCount,
      skipped_row_count: parsed.stopDetail.skippedRowCount,
    },
    package_detail: {
      parsed_row_count: parsed.packageDetail.parsedRowCount,
      skipped_row_count: parsed.packageDetail.skippedRowCount,
      express_package_count: parsed.packageDetail.rows.filter((row) => row.is_express).length,
      attached_tracking_reference_count: attachedTrackingReferenceCount,
    },
    deduplication: {
      duplicate_stop_count: stopRows.duplicateCount,
      unidentified_stop_count: stopRows.unidentifiedCount,
      duplicate_package_count: packageRows.duplicateCount,
      unidentified_package_count: packageRows.unidentifiedCount,
    },
  };
}

async function processPickupArtifact(params: {
  supabase: SupabaseClientLike;
  artifact: ManifestArtifactRow;
  buffer: Buffer;
}) {
  const { supabase, artifact, buffer } = params;
  const workbook = readManifestWorkbook(buffer);
  const parsed = parsePickupManifest(pickupManifestSheetsFromWorkbook(workbook));

  const { data: replaceResult, error: replaceError } = await supabase.rpc(
    "replace_operations_pickup_manifest_rows",
    {
      p_artifact_id: artifact.id,
      p_pickup_rows: parsed.pickupDetail.rows,
    }
  );

  if (replaceError) throw new Error(replaceError.message);

  return {
    inserted_pickup_count: Number(replaceResult?.pickup_stop_count ?? 0),
    metadata: parsed.metadata,
    pickup_detail: {
      parsed_row_count: parsed.pickupDetail.parsedRowCount,
      skipped_row_count: parsed.pickupDetail.skippedRowCount,
    },
  };
}

export async function processManifestArtifact(params: {
  supabase: SupabaseClientLike;
  artifact: ManifestArtifactRow;
  buffer?: Buffer;
}): Promise<ManifestProcessorResult> {
  const { supabase, artifact } = params;

  try {
    await updateArtifactStatus({
      supabase,
      artifact,
      status: "VALIDATING",
      metadata: {
        processor_started_at: new Date().toISOString(),
      },
    });

    if (!["delivery", "pickup"].includes(artifact.manifest_type)) {
      throw new Error(`Unsupported manifest_type ${artifact.manifest_type}.`);
    }

    const buffer = params.buffer ?? await downloadManifestArtifact(supabase, artifact);

    await updateArtifactStatus({
      supabase,
      artifact,
      status: "PARSING",
      metadata: {
        processor_parsing_at: new Date().toISOString(),
      },
    });

    const result =
      artifact.manifest_type === "delivery"
        ? await processDeliveryArtifact({ supabase, artifact, buffer })
        : await processPickupArtifact({ supabase, artifact, buffer });

    await updateArtifactStatus({
      supabase,
      artifact,
      status: "NORMALIZED",
      metadata: {
        processor_completed_at: new Date().toISOString(),
        ...result,
      },
    });

    const routeStatus = await reconcileRouteStatus({ supabase, artifact });
    await reconcilePlanStatus({ supabase, capturePlanId: artifact.capture_plan_id });

    return {
      artifact_id: artifact.id,
      manifest_type: artifact.manifest_type,
      status: "NORMALIZED",
      route_status: routeStatus,
      inserted_stop_count:
        "inserted_stop_count" in result ? result.inserted_stop_count : undefined,
      inserted_package_count:
        "inserted_package_count" in result ? result.inserted_package_count : undefined,
      inserted_pickup_count:
        "inserted_pickup_count" in result ? result.inserted_pickup_count : undefined,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Manifest artifact processing failed.";

    await updateArtifactStatus({
      supabase,
      artifact,
      status: "FAILED",
      metadata: {
        processor_failed_at: new Date().toISOString(),
      },
      errorMessage: message,
    }).catch(() => null);

    await reconcileRouteStatus({ supabase, artifact }).catch(() => null);
    await reconcilePlanStatus({ supabase, capturePlanId: artifact.capture_plan_id }).catch(
      () => null
    );

    return {
      artifact_id: artifact.id,
      manifest_type: artifact.manifest_type,
      status: "FAILED",
      error: message,
    };
  }
}

export async function processCapturedManifestArtifacts(params: {
  supabase: SupabaseClientLike;
  limit?: number;
  collectionRequestId?: string | null;
}) {
  const { supabase, limit = 10, collectionRequestId = null } = params;

  let artifactQuery = supabase
    .from("operations_manifest_artifact_v")
    .select("*")
    .eq("artifact_status", "CAPTURED")
    .order("captured_at", { ascending: true })
    .limit(limit);

  if (collectionRequestId) {
    artifactQuery = artifactQuery.contains("metadata_json", {
      source_collection_request_id: collectionRequestId,
    });
  }

  const { data, error } = await artifactQuery;

  if (error) {
    throw new Error(error.message);
  }

  const artifacts = (data ?? []) as ManifestArtifactRow[];
  const processed: ManifestProcessorResult[] = [];

  for (const artifact of artifacts) {
    processed.push(await processManifestArtifact({ supabase, artifact }));
  }

  return processed;
}
