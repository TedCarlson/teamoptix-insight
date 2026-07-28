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
    { p_limit: 50_000 }
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

  return NextResponse.json({
    ok: failures.length === 0,
    database_pii: piiPurge,
    raw_artifact_candidate_count: candidates.length,
    raw_artifact_deleted_count: deletedArtifactCount,
    artifact_marked_purged_count: completedArtifactCount,
    failure_count: failures.length,
    failures,
    elapsed_ms: Date.now() - startedAt,
  });
}
