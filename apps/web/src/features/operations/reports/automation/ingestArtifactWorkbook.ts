import { ingestDswWorkbook } from "@/features/operations/reports/dsw/dsw.ingest";
import { ingestFccWorkbook } from "@/features/operations/reports/fcc/fcc.ingest";

type ArtifactRow = {
  id: string;
  service_date: string | null;
  artifact_kind: string;
  report_family_key: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  original_filename: string | null;
  normalized_filename: string | null;
  size_bytes: number | null;
};

async function downloadArtifactBuffer(params: {
  bucket: string;
  path: string;
}) {
  const { bucket, path } = params;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL.");
  if (!serviceRoleKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");

  const url = `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/${encodeURIComponent(bucket)}/${path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/")}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Artifact download failed: HTTP ${response.status} ${body}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

export async function ingestArtifactWorkbook(params: {
  supabase: any;
  slug: string;
  artifact: ArtifactRow;
  uploadedByAuthUserId?: string | null;
  uploadedByProfileId?: string | null;
}) {
  const { supabase, slug, artifact, uploadedByAuthUserId = null, uploadedByProfileId = null } = params;

  if (artifact.artifact_kind !== "REPORT_FILE") throw new Error("Only report files can be ingested.");
  if (!artifact.storage_bucket || !artifact.storage_path) throw new Error("Artifact is missing storage location.");

  const buffer = await downloadArtifactBuffer({
    bucket: artifact.storage_bucket,
    path: artifact.storage_path,
  });

  const filename = artifact.original_filename || artifact.normalized_filename || "artifact.xls";

  if (artifact.report_family_key === "DSW") {
    return ingestDswWorkbook({
      supabase,
      slug,
      buffer,
      filename,
      fileSize: artifact.size_bytes ?? buffer.length,
      uploadedByAuthUserId,
      uploadedByProfileId,
    });
  }

  if (artifact.report_family_key === "FCC") {
    return ingestFccWorkbook({
      supabase,
      slug,
      buffer,
      filename,
      fileSize: artifact.size_bytes ?? buffer.length,
      serviceDate: artifact.service_date ?? undefined,
      uploadedByAuthUserId,
      uploadedByProfileId,
    });
  }

  throw new Error(`Unsupported artifact family ${artifact.report_family_key ?? "UNKNOWN"}.`);
}
