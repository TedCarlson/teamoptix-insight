import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";
export const maxDuration = 300;

type PurgeCandidate = {
  artifact_id: string;
  storage_bucket: string;
  storage_path: string;
};

type ManifestPurgeCandidate = PurgeCandidate & {
  artifact_source: "manifest" | "collection";
};

function isAuthorized(req: NextRequest) {
  const expected = process.env.CRON_SECRET ?? "";
  const supplied = (req.headers.get("authorization") ?? "").replace(
    /^Bearer\s+/i,
    ""
  );
  if (!expected || !supplied) return false;
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  return (
    expectedBuffer.length === suppliedBuffer.length &&
    timingSafeEqual(expectedBuffer, suppliedBuffer)
  );
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const startedAt = Date.now();
  const supabase = createSupabaseServiceRoleClient();
  const { data: piiPurge, error: piiPurgeError } = await supabase.rpc(
    "purge_operations_dsw_package_status_pii",
    { p_limit: 5_000 }
  );
  if (piiPurgeError) {
    return NextResponse.json(
      { ok: false, error: piiPurgeError.message },
      { status: 500 }
    );
  }

  const { data, error } = await supabase.rpc(
    "list_operations_dsw_package_artifacts_for_purge",
    { p_limit: 500 }
  );
  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  const candidates = (data ?? []) as PurgeCandidate[];
  const byBucket = new Map<string, PurgeCandidate[]>();
  for (const candidate of candidates) {
    const rows = byBucket.get(candidate.storage_bucket) ?? [];
    rows.push(candidate);
    byBucket.set(candidate.storage_bucket, rows);
  }

  let deletedArtifactCount = 0;
  let completedArtifactCount = 0;
  const failures: Array<{ bucket: string; artifact_count: number; error: string }> = [];

  for (const [bucket, rows] of byBucket) {
    const { error: deleteError } = await supabase.storage
      .from(bucket)
      .remove(rows.map((row) => row.storage_path));
    if (deleteError) {
      failures.push({
        bucket,
        artifact_count: rows.length,
        error: deleteError.message,
      });
      continue;
    }

    const { data: completed, error: completeError } = await supabase.rpc(
      "complete_operations_dsw_package_artifact_purge",
      { p_artifact_ids: rows.map((row) => row.artifact_id) }
    );
    if (completeError) {
      failures.push({
        bucket,
        artifact_count: rows.length,
        error: completeError.message,
      });
      continue;
    }
    deletedArtifactCount += rows.length;
    completedArtifactCount += Number(completed ?? 0);
  }

  const { data: routeClusterMaterialization, error: routeClusterError } =
    await supabase.rpc("materialize_operations_route_stop_cluster_facts", {
      p_limit: 5_000,
    });
  if (routeClusterError) {
    return NextResponse.json(
      { ok: false, error: routeClusterError.message },
      { status: 500 }
    );
  }

  const { data: manifestData, error: manifestListError } = await supabase.rpc(
    "list_operations_manifest_history_artifacts_for_purge",
    { p_limit: 1000 }
  );
  if (manifestListError) {
    return NextResponse.json(
      { ok: false, error: manifestListError.message },
      { status: 500 }
    );
  }

  const manifestCandidates = (manifestData ?? []) as ManifestPurgeCandidate[];
  const manifestByBucket = new Map<string, ManifestPurgeCandidate[]>();
  for (const candidate of manifestCandidates) {
    const rows = manifestByBucket.get(candidate.storage_bucket) ?? [];
    rows.push(candidate);
    manifestByBucket.set(candidate.storage_bucket, rows);
  }

  let manifestSourceDeletedCount = 0;
  let manifestWarehouseDeletedCount = 0;
  let manifestCollectionDeletedCount = 0;
  const manifestFailures: Array<{
    bucket: string;
    artifact_count: number;
    error: string;
  }> = [];

  for (const [bucket, rows] of manifestByBucket) {
    const paths = Array.from(new Set(rows.map((row) => row.storage_path)));
    const { error: deleteError } = await supabase.storage
      .from(bucket)
      .remove(paths);
    if (deleteError) {
      manifestFailures.push({
        bucket,
        artifact_count: rows.length,
        error: deleteError.message,
      });
      continue;
    }

    const manifestIds = rows
      .filter((row) => row.artifact_source === "manifest")
      .map((row) => row.artifact_id);
    const collectionIds = rows
      .filter((row) => row.artifact_source === "collection")
      .map((row) => row.artifact_id);
    const { data: completed, error: completeError } = await supabase.rpc(
      "complete_operations_manifest_history_artifact_purge",
      {
        p_manifest_artifact_ids: manifestIds,
        p_collection_artifact_ids: collectionIds,
      }
    );
    if (completeError) {
      manifestFailures.push({
        bucket,
        artifact_count: rows.length,
        error: completeError.message,
      });
      continue;
    }

    manifestSourceDeletedCount += rows.length;
    manifestWarehouseDeletedCount += Number(
      completed?.manifest_artifact_deleted_count ?? 0
    );
    manifestCollectionDeletedCount += Number(
      completed?.collection_artifact_deleted_count ?? 0
    );
  }

  const { data: fccHistoryPurge, error: fccHistoryPurgeError } =
    await supabase.rpc("purge_operations_fcc_delivery_history", {
      p_limit: 5_000,
    });
  if (fccHistoryPurgeError) {
    return NextResponse.json(
      { ok: false, error: fccHistoryPurgeError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok:
      failures.length === 0 &&
      manifestFailures.length === 0,
    database_pii: piiPurge,
    raw_artifact_candidate_count: candidates.length,
    raw_artifact_deleted_count: deletedArtifactCount,
    artifact_marked_purged_count: completedArtifactCount,
    failure_count: failures.length,
    failures,
    route_stop_cluster_materialization: routeClusterMaterialization,
    manifest_source_candidate_count: manifestCandidates.length,
    manifest_source_deleted_count: manifestSourceDeletedCount,
    manifest_warehouse_deleted_count: manifestWarehouseDeletedCount,
    manifest_collection_deleted_count: manifestCollectionDeletedCount,
    manifest_failure_count: manifestFailures.length,
    manifest_failures: manifestFailures,
    fcc_history: fccHistoryPurge,
    elapsed_ms: Date.now() - startedAt,
  });
}
