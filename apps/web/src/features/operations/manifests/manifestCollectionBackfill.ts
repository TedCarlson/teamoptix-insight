import {
  deliveryManifestSheetsFromWorkbook,
  parseDeliveryManifest,
  readManifestWorkbook,
} from "@/features/operations/manifests";
import { dedupeDeliveryManifestStops } from "@/features/operations/manifests/deliveryManifest.dedupe";
import { summarizeManifestStops } from "@/features/operations/manifests/manifestCollectionPace";
import { manifestHistoryWindow } from "@/features/operations/manifests/manifestHistory";

type SupabaseClientLike = any;

type CollectionArtifactRow = {
  id: string;
  storage_bucket: string;
  storage_path: string;
  ingest_metadata_json: Record<string, unknown> | null;
};

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function backfillResolved(artifact: CollectionArtifactRow) {
  const metadata = recordValue(artifact.ingest_metadata_json);
  const ingest = recordValue(metadata.ingest);
  const retention = recordValue(metadata.source_retention);
  if (retention.status === "MISSING_LEGACY_DIRECT_OBJECT") return true;
  const completedStopCount = ingest.completed_stop_count;
  return completedStopCount !== null &&
    completedStopCount !== undefined &&
    completedStopCount !== "" &&
    Number.isFinite(Number(completedStopCount));
}

export async function backfillManifestCollectionPaceMetadata(params: {
  supabase: SupabaseClientLike;
  limit?: number;
  now?: Date;
}) {
  const { supabase, now = new Date() } = params;
  const limit = Math.max(1, Math.min(params.limit ?? 10, 25));
  const { detail_minimum: detailMinimum, maximum } = manifestHistoryWindow(now);
  const { data, error } = await supabase
    .from("operations_collection_artifact_v")
    .select(
      "id,storage_bucket,storage_path,ingest_metadata_json,runner_artifact_json,service_date,created_at"
    )
    .eq("artifact_kind", "REPORT_FILE")
    .eq("artifact_status", "INGESTED")
    .gte("service_date", detailMinimum)
    .lte("service_date", maximum)
    .contains("runner_artifact_json", { artifact_key: "DELIVERY_MANIFEST" })
    .order("service_date", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(250);

  if (error) throw new Error(error.message);

  const candidates = ((data ?? []) as CollectionArtifactRow[])
    .filter((artifact) => !backfillResolved(artifact))
    .slice(0, limit);
  const results: Array<{
    artifact_id: string;
    status: "BACKFILLED" | "FAILED";
    completed_stop_count?: number;
    open_stop_count?: number;
    error?: string;
  }> = [];

  for (const artifact of candidates) {
    try {
      const { data: blob, error: downloadError } = await supabase.storage
        .from(artifact.storage_bucket)
        .download(artifact.storage_path);
      if (downloadError || !blob) {
        throw new Error(
          downloadError?.message ?? "Manifest collection source was not readable."
        );
      }
      const workbook = readManifestWorkbook(Buffer.from(await blob.arrayBuffer()));
      const parsed = parseDeliveryManifest(
        deliveryManifestSheetsFromWorkbook(workbook)
      );
      const stops = dedupeDeliveryManifestStops(parsed.stopDetail.rows);
      const summary = summarizeManifestStops(stops.rows);
      const { data: updated, error: updateError } = await supabase.rpc(
        "backfill_operations_manifest_collection_pace_metadata",
        {
          p_artifact_id: artifact.id,
          p_completed_stop_count: summary.completed_stop_count,
          p_open_stop_count: summary.open_stop_count,
        }
      );
      if (updateError) throw new Error(updateError.message);
      if (!updated) throw new Error("Manifest collection receipt was not eligible.");
      results.push({
        artifact_id: artifact.id,
        status: "BACKFILLED",
        completed_stop_count: summary.completed_stop_count,
        open_stop_count: summary.open_stop_count,
      });
    } catch (backfillError) {
      results.push({
        artifact_id: artifact.id,
        status: "FAILED",
        error:
          backfillError instanceof Error
            ? backfillError.message
            : "Manifest collection pace backfill failed.",
      });
    }
  }

  return results;
}
