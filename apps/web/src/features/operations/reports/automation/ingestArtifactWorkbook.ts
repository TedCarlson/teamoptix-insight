import { ingestDswWorkbook } from "@/features/operations/reports/dsw/dsw.ingest";

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

export async function ingestArtifactWorkbook(params: {
  supabase: any;
  slug: string;
  artifact: ArtifactRow;
  uploadedByAuthUserId?: string | null;
  uploadedByProfileId?: string | null;
}) {
  const { supabase, slug, artifact, uploadedByAuthUserId = null, uploadedByProfileId = null } = params;

  if (artifact.artifact_kind !== "REPORT_FILE") throw new Error("Only report files can be ingested.");
  if (artifact.report_family_key !== "DSW") throw new Error("Only DSW artifact ingest is enabled.");
  if (!artifact.storage_bucket || !artifact.storage_path) throw new Error("Artifact is missing storage location.");

  const { data: blob, error } = await supabase.storage
    .from(artifact.storage_bucket)
    .download(artifact.storage_path);

  if (error || !blob) throw new Error(error?.message ?? "Artifact download failed.");

  const buffer = Buffer.from(await blob.arrayBuffer());

  return ingestDswWorkbook({
    supabase,
    slug,
    buffer,
    filename: artifact.normalized_filename || artifact.original_filename || "artifact.xls",
    fileSize: artifact.size_bytes ?? buffer.length,
    requestedDate: artifact.service_date ?? undefined,
    uploadedByAuthUserId,
    uploadedByProfileId,
  });
}
