import { ingestDswWorkbook } from "@/features/operations/reports/dsw/dsw.ingest";
import { ingestDswPackageStatusWorkbook } from "@/features/operations/reports/dsw/packageStatus/packageStatus.ingest";
import { ingestDroPackageDetailWorkbook } from "@/features/operations/reports/dro/dro.ingest";
import { ingestFccWorkbook } from "@/features/operations/reports/fcc/fcc.ingest";
import {
  artifactWarehouseLineage,
  declaredArtifactKey,
  reportFamilyFromArtifact,
} from "@/features/operations/reports/automation/artifactWarehouseLineage";

type ArtifactRow = {
  id: string;
  collection_request_id?: string | null;
  company_id?: string | null;
  service_date: string | null;
  artifact_kind: string;
  report_family_key: string | null;
  report_shape_key?: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  original_filename: string | null;
  normalized_filename: string | null;
  size_bytes: number | null;
  runner_key?: string | null;
  runner_artifact_json?: Record<string, unknown> | null;
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
  buffer?: Buffer;
  uploadedByAuthUserId?: string | null;
  uploadedByProfileId?: string | null;
}) {
  const { supabase, slug, artifact, uploadedByAuthUserId = null, uploadedByProfileId = null } = params;

  if (artifact.artifact_kind !== "REPORT_FILE") throw new Error("Only report files can be ingested.");
  if (!params.buffer && (!artifact.storage_bucket || !artifact.storage_path)) {
    throw new Error("Artifact is missing storage location.");
  }

  const buffer = params.buffer ?? await downloadArtifactBuffer({
    bucket: artifact.storage_bucket!,
    path: artifact.storage_path!,
  });

  const lineage = artifactWarehouseLineage({ artifact, companySlug: slug });
  const filename = lineage.warehouseSourceFilename;
  const artifactKey = declaredArtifactKey(artifact) ?? "";
  const reportFamilyKey = reportFamilyFromArtifact(artifact);

  if (reportFamilyKey === "DSW") {
    if (artifactKey === "DSW_ALL_STATUS_CODE_PACKAGES") {
      return ingestDswPackageStatusWorkbook({
        supabase,
        slug,
        buffer,
        filename,
        artifact,
        artifactLineage: lineage.metadata,
      });
    }
    return ingestDswWorkbook({
      supabase,
      slug,
      buffer,
      filename,
      fileSize: artifact.size_bytes ?? buffer.length,
      uploadedByAuthUserId,
      uploadedByProfileId,
      artifactLineage: lineage.metadata,
    });
  }

  if (reportFamilyKey === "FCC") {
    return ingestFccWorkbook({
      supabase,
      slug,
      buffer,
      filename,
      fileSize: artifact.size_bytes ?? buffer.length,
      serviceDate: artifact.service_date ?? undefined,
      uploadedByAuthUserId,
      uploadedByProfileId,
      artifactLineage: lineage.metadata,
    });
  }

  if (reportFamilyKey === "DRO") {
    if (artifactKey !== "DRO_PACKAGE_DETAIL") {
      throw new Error(`Unsupported DRO artifact ${artifactKey || "UNKNOWN"}.`);
    }
    return ingestDroPackageDetailWorkbook({
      supabase,
      slug,
      buffer,
      filename,
      artifact,
      uploadedByProfileId,
      artifactLineage: lineage.metadata,
    });
  }

  throw new Error(`Unsupported artifact family ${reportFamilyKey ?? "UNKNOWN"}.`);
}
