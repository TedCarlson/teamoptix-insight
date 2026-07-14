import {
  deliveryManifestSheetsFromWorkbook,
  parseDeliveryManifest,
  parsePickupManifest,
  pickupManifestSheetsFromWorkbook,
  readManifestWorkbook,
} from "@/features/operations/manifests";

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

  const updatePayload: Record<string, unknown> = {
    artifact_status: status,
    metadata_json: mergeMetadata(artifact, metadata),
    error_message: errorMessage,
    updated_at: new Date().toISOString(),
  };

  if (status === "NORMALIZED" || status === "FAILED") {
    updatePayload.processed_at = new Date().toISOString();
  }

  const { error } = await supabase
    .schema("core")
    .from("operations_manifest_artifact")
    .update(updatePayload)
    .eq("id", artifact.id);

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

async function replaceRows(params: {
  supabase: SupabaseClientLike;
  table: string;
  sourceArtifactId: string;
  rows: Record<string, unknown>[];
}) {
  const { supabase, table, sourceArtifactId, rows } = params;

  const deleteResult = await supabase
    .schema("core")
    .from(table)
    .delete()
    .eq("source_artifact_id", sourceArtifactId);

  if (deleteResult.error) {
    throw new Error(deleteResult.error.message);
  }

  if (rows.length === 0) return;

  const insertResult = await supabase
    .schema("core")
    .from(table)
    .insert(rows);

  if (insertResult.error) {
    throw new Error(insertResult.error.message);
  }
}

function deliveryStopRowsForInsert(artifact: ManifestArtifactRow, rows: any[]) {
  return rows.map((row) => ({
    company_id: artifact.company_id,
    service_date: artifact.service_date,
    route_key: artifact.route_key,
    st_number: row.st_number,
    sid: row.sid,
    recipient: row.recipient,
    contact_name: row.contact_name,
    phone: row.phone,
    address_line_1: row.address_line_1,
    address_line_2: row.address_line_2,
    city: row.city,
    state: row.state,
    postal_code: row.postal_code,
    delivery_time_begin: row.delivery_time_begin,
    delivery_time_end: row.delivery_time_end,
    package_count: row.package_count,
    stop_instructions: row.stop_instructions,
    completed: row.completed,
    source_artifact_id: artifact.id,
    source_capture_plan_id: artifact.capture_plan_id,
  }));
}

function deliveryPackageRowsForInsert(artifact: ManifestArtifactRow, rows: any[]) {
  return rows.map((row) => ({
    company_id: artifact.company_id,
    service_date: artifact.service_date,
    route_key: artifact.route_key,
    st_number: row.st_number,
    sid: row.sid,
    recipient: row.recipient,
    contact_name: row.contact_name,
    address_line_1: row.address_line_1,
    address_line_2: row.address_line_2,
    city: row.city,
    state: row.state,
    postal_code: row.postal_code,
    tracking_id: row.tracking_id,
    prem_svc_raw: row.prem_svc_raw,
    is_express: row.is_express,
    is_residential: row.is_residential,
    is_signature: row.is_signature,
    is_hazmat: row.is_hazmat,
    is_collection: row.is_collection,
    source_artifact_id: artifact.id,
    source_capture_plan_id: artifact.capture_plan_id,
  }));
}

function pickupRowsForInsert(artifact: ManifestArtifactRow, rows: any[]) {
  return rows.map((row) => ({
    company_id: artifact.company_id,
    service_date: artifact.service_date,
    route_key: artifact.route_key,
    pickup_list: row.pickup_list,
    station: row.station,
    wa: row.wa,
    puid: row.puid,
    pickup_type: row.pickup_type,
    shipper_number: row.shipper_number,
    shipper_name: row.shipper_name,
    address_line_1: row.address_line_1,
    address_line_2: row.address_line_2,
    city: row.city,
    state: row.state,
    postal_code: row.postal_code,
    ready_at: row.ready_at,
    close_at: row.close_at,
    pu_closed_at: row.pu_closed_at,
    reason_code: row.reason_code,
    package_count_expected: row.package_count_expected,
    packages_picked_up: row.packages_picked_up,
    source_artifact_id: artifact.id,
    source_capture_plan_id: artifact.capture_plan_id,
  }));
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

  const stopRows = deliveryStopRowsForInsert(artifact, parsed.stopDetail.rows);
  const packageRows = deliveryPackageRowsForInsert(artifact, parsed.packageDetail.rows);

  await replaceRows({
    supabase,
    table: "operations_delivery_manifest_stop",
    sourceArtifactId: artifact.id,
    rows: stopRows,
  });

  await replaceRows({
    supabase,
    table: "operations_delivery_manifest_package",
    sourceArtifactId: artifact.id,
    rows: packageRows,
  });

  return {
    inserted_stop_count: stopRows.length,
    inserted_package_count: packageRows.length,
    metadata: parsed.metadata,
    stop_detail: {
      parsed_row_count: parsed.stopDetail.parsedRowCount,
      skipped_row_count: parsed.stopDetail.skippedRowCount,
    },
    package_detail: {
      parsed_row_count: parsed.packageDetail.parsedRowCount,
      skipped_row_count: parsed.packageDetail.skippedRowCount,
      express_package_count: parsed.packageDetail.rows.filter((row) => row.is_express).length,
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

  const pickupRows = pickupRowsForInsert(artifact, parsed.pickupDetail.rows);

  await replaceRows({
    supabase,
    table: "operations_pickup_manifest_stop",
    sourceArtifactId: artifact.id,
    rows: pickupRows,
  });

  return {
    inserted_pickup_count: pickupRows.length,
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

    const buffer = await downloadManifestArtifact(supabase, artifact);

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
}) {
  const { supabase, limit = 10 } = params;

  const { data, error } = await supabase
    .from("operations_manifest_artifact_v")
    .select("*")
    .eq("artifact_status", "CAPTURED")
    .order("captured_at", { ascending: true })
    .limit(limit);

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
