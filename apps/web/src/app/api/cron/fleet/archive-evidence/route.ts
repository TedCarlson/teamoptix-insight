import { createHash } from "node:crypto";
import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";
export const maxDuration = 300;

type ArchiveCandidate = {
  evidence_id: string;
  company_id: string;
  vehicle_id: string;
  inspection_id: string;
  hot_storage_bucket: string;
  hot_storage_path: string;
  content_type: string;
  size_bytes: number;
  sha256: string;
  captured_at: string;
};

function requiredEnvironment() {
  const endpoint = process.env.B2_S3_ENDPOINT;
  const region = process.env.B2_S3_REGION;
  const accessKeyId = process.env.B2_KEY_ID;
  const secretAccessKey = process.env.B2_APPLICATION_KEY;
  const bucket = process.env.B2_FLEET_EVIDENCE_BUCKET;

  if (!endpoint || !region || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error("Fleet evidence archive is not configured.");
  }

  return { endpoint, region, accessKeyId, secretAccessKey, bucket };
}

function archiveKey(row: ArchiveCandidate) {
  const date = row.captured_at.slice(0, 10);
  const [year, month] = date.split("-");
  return [
    `company=${row.company_id}`,
    `year=${year}`,
    `month=${month}`,
    `date=${date}`,
    `vehicle=${row.vehicle_id}`,
    `inspection=${row.inspection_id}`,
    `${row.evidence_id}.webp`,
  ].join("/");
}

export async function GET() {
  const startedAt = Date.now();
  const config = requiredEnvironment();
  const retentionDays = Math.max(1, Number(process.env.FLEET_EVIDENCE_HOT_DAYS ?? 30));
  const cutoff = new Date(Date.now() - retentionDays * 86_400_000).toISOString();
  const supabase = createSupabaseServiceRoleClient();
  const s3 = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  const { data, error } = await supabase.rpc(
    "claim_fleet_evidence_archive_candidates",
    { p_cutoff: cutoff, p_limit: 25 }
  );
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const archived: Array<Record<string, unknown>> = [];
  const failed: Array<Record<string, unknown>> = [];

  for (const row of (data ?? []) as ArchiveCandidate[]) {
    try {
      const { data: object, error: downloadError } = await supabase.storage
        .from(row.hot_storage_bucket)
        .download(row.hot_storage_path);
      if (downloadError || !object) throw new Error(downloadError?.message ?? "Hot evidence object is missing.");

      const body = Buffer.from(await object.arrayBuffer());
      const sha256 = createHash("sha256").update(body).digest("hex");
      if (sha256 !== row.sha256) throw new Error("Hot evidence checksum does not match its index.");

      const key = archiveKey(row);
      await s3.send(new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: body,
        ContentType: row.content_type,
        Metadata: {
          sha256,
          inspection_id: row.inspection_id,
          evidence_id: row.evidence_id,
        },
      }));

      const head = await s3.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }));
      if (Number(head.ContentLength ?? -1) !== body.length || head.Metadata?.sha256 !== sha256) {
        throw new Error("Archived evidence verification failed.");
      }

      const archiveRecord = {
        p_evidence_id: row.evidence_id,
        p_archive_provider: "BACKBLAZE_B2",
        p_archive_bucket: config.bucket,
        p_archive_key: key,
        p_archive_etag: head.ETag ?? null,
      };
      const { error: archiveRecordError } = await supabase.rpc(
        "complete_fleet_evidence_archive",
        { ...archiveRecord, p_hot_deleted: false }
      );
      if (archiveRecordError) throw new Error(archiveRecordError.message);

      const { error: deleteError } = await supabase.storage
        .from(row.hot_storage_bucket)
        .remove([row.hot_storage_path]);
      if (deleteError) throw new Error(`Archive verified, but hot cleanup failed: ${deleteError.message}`);

      const { error: completeError } = await supabase.rpc(
        "complete_fleet_evidence_archive",
        { ...archiveRecord, p_hot_deleted: true }
      );
      if (completeError) throw new Error(completeError.message);

      archived.push({ evidence_id: row.evidence_id, archive_key: key, size_bytes: body.length });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Evidence archive failed.";
      await supabase.rpc("fail_fleet_evidence_archive", {
        p_evidence_id: row.evidence_id,
        p_error: message,
      });
      failed.push({ evidence_id: row.evidence_id, error: message });
    }
  }

  return NextResponse.json({
    ok: failed.length === 0,
    cutoff,
    retention_days: retentionDays,
    archived_count: archived.length,
    archived,
    failed_count: failed.length,
    failed,
    elapsed_ms: Date.now() - startedAt,
  });
}
