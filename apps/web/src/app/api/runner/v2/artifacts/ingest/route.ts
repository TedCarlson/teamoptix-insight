import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { manifestIdentityFromBuffer } from "@/features/operations/manifests/manifest.identity";
import { processManifestArtifact } from "@/features/operations/manifests/manifest.processor";
import {
  ingestRouteGpxArtifact,
  isRouteGpxCollectionArtifact,
  resolveRouteGpxManifestReadiness,
} from "@/features/operations/manifests/routeGpx";
import {
  isManifestCollectionArtifact,
  isRetryableIngestionTimeout,
  manifestPreparationPayload,
} from "@/features/operations/reports/automation/collectionArtifactAuthority";
import {
  decodeRunnerV2Metadata,
  RUNNER_V2_MAX_DIRECT_BYTES,
} from "@/features/operations/reports/automation/directArtifactContract";
import { ingestArtifactWorkbook } from "@/features/operations/reports/automation/ingestArtifactWorkbook";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";
export const maxDuration = 30;

const DECOMMISSIONED_FCC_ARTIFACT_KEYS = new Set([
  "FCC_SERVICE_AREA_SUMMARY",
  "SERVICE_AREA_SUMMARY",
]);

function isRunnerAuthorized(req: NextRequest) {
  const configured = process.env.INSIGHT_ARTIFACT_INGEST_TOKEN ?? "";
  const supplied = (req.headers.get("authorization") ?? "").replace(
    /^Bearer\s+/i,
    ""
  );
  if (!configured || !supplied) return false;
  const configuredBuffer = Buffer.from(configured);
  const suppliedBuffer = Buffer.from(supplied);
  return (
    configuredBuffer.length === suppliedBuffer.length &&
    timingSafeEqual(configuredBuffer, suppliedBuffer)
  );
}

async function markArtifact(params: {
  supabase: any;
  artifactId: string;
  status: "READY_FOR_INGEST" | "INGESTING" | "INGESTED" | "FAILED" | "IGNORED";
  metadata: Record<string, unknown>;
  reportBatchId?: string | null;
  errorMessage?: string | null;
}) {
  const { error } = await params.supabase.rpc(
    "update_operations_collection_artifact_status",
    {
      p_artifact_id: params.artifactId,
      p_artifact_status: params.status,
      p_ingest_metadata_json: params.metadata,
      p_report_batch_id: params.reportBatchId ?? null,
      p_error_message: params.errorMessage ?? null,
    }
  );
  if (error) throw new Error(error.message);
}

function jsonError(message: string, status: number, elapsedMs: number) {
  return NextResponse.json(
    {
      ok: false,
      durable: false,
      fallback_required: true,
      error: message,
      elapsed_ms: elapsedMs,
    },
    { status }
  );
}

function logReceipt(params: {
  artifactId: string;
  companySlug: string;
  fileType: string;
  outcome: string;
  sizeBytes: number;
  elapsedMs: number;
  duplicate?: boolean;
}) {
  console.info(
    JSON.stringify({
      event: "runner_v2_ingestion_receipt",
      artifact_id: params.artifactId,
      company_slug: params.companySlug,
      file_type: params.fileType,
      outcome: params.outcome,
      size_bytes: params.sizeBytes,
      elapsed_ms: params.elapsedMs,
      duplicate: params.duplicate ?? false,
    })
  );
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  let artifactId: string | null = null;
  let supabase: any = null;
  let sourceRetention: Record<string, unknown> | null = null;

  try {
    if (!isRunnerAuthorized(req)) {
      return NextResponse.json(
        { ok: false, durable: false, error: "Unauthorized." },
        { status: 401 }
      );
    }

    const declaredLength = Number(req.headers.get("content-length") ?? "0");
    if (
      Number.isFinite(declaredLength) &&
      declaredLength > RUNNER_V2_MAX_DIRECT_BYTES
    ) {
      return jsonError(
        "Artifact exceeds the direct-ingestion size limit.",
        413,
        Date.now() - startedAt
      );
    }

    const metadata = decodeRunnerV2Metadata(
      req.headers.get("x-teamoptix-artifact-metadata")
    );
    artifactId = metadata.artifact_id;

    const buffer = Buffer.from(await req.arrayBuffer());
    if (buffer.length !== metadata.size_bytes) {
      return jsonError(
        "Artifact byte count does not match the handoff envelope.",
        400,
        Date.now() - startedAt
      );
    }
    const actualHash = createHash("sha256").update(buffer).digest("hex");
    if (actualHash !== metadata.source_hash) {
      return jsonError(
        "Artifact hash does not match the handoff envelope.",
        400,
        Date.now() - startedAt
      );
    }

    supabase = createSupabaseServiceRoleClient();
    const { data: registeredData, error: registerError } = await supabase.rpc(
      "begin_operations_runner_direct_artifact_ingest",
      {
        p_artifact_id: metadata.artifact_id,
        p_collection_request_id: metadata.collection_request_id,
        p_company_id: metadata.company_id,
        p_company_slug: metadata.company_slug,
        p_runner_key: metadata.runner_key,
        p_requested_service_date: metadata.requested_service_date,
        p_source_lane: metadata.source_lane,
        p_source_filename: metadata.source_filename,
        p_transport_filename: metadata.transport_filename,
        p_artifact_key: metadata.artifact_key,
        p_report_family_key: metadata.report_family_key,
        p_report_shape_key: metadata.report_shape_key ?? null,
        p_report_frame: metadata.report_frame ?? null,
        p_content_type: metadata.content_type,
        p_size_bytes: metadata.size_bytes,
        p_source_hash: metadata.source_hash,
        p_runner_artifact_json: metadata.runner_artifact_json ?? {},
      }
    );
    if (registerError) throw new Error(registerError.message);

    const artifact = Array.isArray(registeredData)
      ? registeredData[0]
      : registeredData;
    if (!artifact) throw new Error("Direct-ingestion receipt was not created.");

    const { error: sourceStorageError } = await supabase.storage
      .from(artifact.storage_bucket)
      .upload(artifact.storage_path, buffer, {
        contentType: metadata.content_type,
        upsert: true,
      });
    if (sourceStorageError) {
      throw new Error(
        `Direct-ingestion source retention failed: ${sourceStorageError.message}`
      );
    }
    sourceRetention = {
      status: "STORED",
      stored_at: new Date().toISOString(),
      storage_bucket: artifact.storage_bucket,
      storage_path: artifact.storage_path,
      source_hash: metadata.source_hash,
      size_bytes: metadata.size_bytes,
    };

    if (["INGESTED", "IGNORED"].includes(artifact.artifact_status)) {
      logReceipt({
        artifactId: artifact.id,
        companySlug: artifact.company_slug,
        fileType: metadata.artifact_key,
        outcome: artifact.artifact_status,
        sizeBytes: metadata.size_bytes,
        elapsedMs: Date.now() - startedAt,
        duplicate: true,
      });
      return NextResponse.json({
        ok: true,
        durable: true,
        duplicate: true,
        artifact_id: artifact.id,
        company_slug: artifact.company_slug,
        artifact_status: artifact.artifact_status,
        elapsed_ms: Date.now() - startedAt,
      });
    }

    const artifactKey = String(metadata.artifact_key).toUpperCase();
    if (DECOMMISSIONED_FCC_ARTIFACT_KEYS.has(artifactKey)) {
      await markArtifact({
        supabase,
        artifactId: artifact.id,
        status: "IGNORED",
        metadata: {
          source: "runner_v2_direct_ingestion",
          phase: "VERIFIED_IGNORED",
          completed_at: new Date().toISOString(),
          reason: "DECOMMISSIONED_FCC_ARTIFACT",
          source_retention: sourceRetention,
        },
      });
      logReceipt({
        artifactId: artifact.id,
        companySlug: artifact.company_slug,
        fileType: artifactKey,
        outcome: "IGNORED",
        sizeBytes: metadata.size_bytes,
        elapsedMs: Date.now() - startedAt,
      });
      return NextResponse.json({
        ok: true,
        durable: true,
        artifact_id: artifact.id,
        company_slug: artifact.company_slug,
        artifact_status: "IGNORED",
        elapsed_ms: Date.now() - startedAt,
      });
    }

    if (isManifestCollectionArtifact(artifact)) {
      const identity = manifestIdentityFromBuffer(buffer);
      const preparation = manifestPreparationPayload({
        artifact,
        identity,
        preparedAt: new Date().toISOString(),
      });
      const { error: prepareError } = await supabase.rpc(
        "prepare_operations_collection_manifest_artifact",
        {
          p_artifact_id: artifact.id,
          p_service_date: preparation.serviceDate,
          p_original_filename: preparation.originalFilename,
          p_normalized_filename: preparation.normalizedFilename,
          p_runner_artifact_json: preparation.runnerArtifact,
          p_ingest_metadata_json: preparation.ingestMetadata,
        }
      );
      if (prepareError) throw new Error(prepareError.message);

      const { error: promoteError } = await supabase.rpc(
        "promote_operations_collection_manifest_artifacts",
        {
          p_collection_request_id: metadata.collection_request_id,
          p_limit: 250,
        }
      );
      if (promoteError) throw new Error(promoteError.message);

      const { data: manifestArtifact, error: manifestArtifactError } =
        await supabase
          .from("operations_manifest_artifact_v")
          .select("*")
          .eq("company_id", metadata.company_id)
          .contains("metadata_json", {
            source_collection_artifact_id: artifact.id,
          })
          .maybeSingle();
      if (manifestArtifactError) throw new Error(manifestArtifactError.message);
      if (!manifestArtifact) {
        throw new Error("Ingestion did not create the manifest receipt.");
      }

      const result = await processManifestArtifact({
        supabase,
        artifact: manifestArtifact,
        buffer,
      });
      if (result.status !== "NORMALIZED") {
        throw new Error(result.error ?? "Manifest normalization failed.");
      }

      await markArtifact({
        supabase,
        artifactId: artifact.id,
        status: "INGESTED",
        metadata: {
          source: "runner_v2_direct_ingestion",
          phase: "INGESTED",
          completed_at: new Date().toISOString(),
          identity_authority: "INGESTION_PIPELINE",
          manifest_identity: identity,
          ingest: result,
          source_retention: sourceRetention,
        },
      });

      logReceipt({
        artifactId: artifact.id,
        companySlug: artifact.company_slug,
        fileType: identity.manifest_type,
        outcome: "INGESTED",
        sizeBytes: metadata.size_bytes,
        elapsedMs: Date.now() - startedAt,
      });

      return NextResponse.json({
        ok: true,
        durable: true,
        artifact_id: artifact.id,
        company_slug: artifact.company_slug,
        artifact_status: "INGESTED",
        file_type: identity.manifest_type,
        route_key: identity.route_key,
        service_date: identity.service_date,
        elapsed_ms: Date.now() - startedAt,
      });
    }

    if (isRouteGpxCollectionArtifact(artifact)) {
      const readiness = await resolveRouteGpxManifestReadiness({
        supabase,
        artifact,
      });
      if (readiness.status === "PENDING") {
        await markArtifact({
          supabase,
          artifactId: artifact.id,
          status: "READY_FOR_INGEST",
          metadata: {
            source: "runner_v2_direct_ingestion",
            phase: "WAITING_FOR_MANIFEST",
            deferred_at: new Date().toISOString(),
            source_retention: sourceRetention,
          },
        });
        return NextResponse.json(
          {
            ok: true,
            durable: true,
            deferred: true,
            fallback_required: false,
            artifact_id: artifact.id,
            artifact_status: "READY_FOR_INGEST",
            reason: "WAITING_FOR_MANIFEST",
            elapsed_ms: Date.now() - startedAt,
          },
          { status: 202 }
        );
      }
      if (readiness.status === "INVALID") {
        throw new Error(
          "Route GPX requires a workbook-verified sibling manifest for the same route and service date."
        );
      }
      const result = await ingestRouteGpxArtifact({
        supabase,
        artifact,
        buffer,
        verifiedManifest: readiness.manifest,
      });
      await markArtifact({
        supabase,
        artifactId: artifact.id,
        status: "INGESTED",
        metadata: {
          source: "runner_v2_direct_ingestion",
          phase: "INGESTED",
          completed_at: new Date().toISOString(),
          result,
          source_retention: sourceRetention,
        },
      });
      logReceipt({
        artifactId: artifact.id,
        companySlug: artifact.company_slug,
        fileType: "ROUTE_GPX",
        outcome: "INGESTED",
        sizeBytes: metadata.size_bytes,
        elapsedMs: Date.now() - startedAt,
      });
      return NextResponse.json({
        ok: true,
        durable: true,
        artifact_id: artifact.id,
        company_slug: artifact.company_slug,
        artifact_status: "INGESTED",
        file_type: "ROUTE_GPX",
        route_key: result?.route_key ?? null,
        elapsed_ms: Date.now() - startedAt,
      });
    }

    const ingest = await ingestArtifactWorkbook({
      supabase,
      slug: artifact.company_slug,
      artifact,
      buffer,
      uploadedByAuthUserId: null,
      uploadedByProfileId: null,
    });
    await markArtifact({
      supabase,
      artifactId: artifact.id,
      status: "INGESTED",
      metadata: {
        source: "runner_v2_direct_ingestion",
        phase: "INGESTED",
        completed_at: new Date().toISOString(),
        ingest,
        source_retention: sourceRetention,
      },
      reportBatchId: ingest.batch_id ?? null,
    });

    logReceipt({
      artifactId: artifact.id,
      companySlug: artifact.company_slug,
      fileType: metadata.artifact_key,
      outcome: "INGESTED",
      sizeBytes: metadata.size_bytes,
      elapsedMs: Date.now() - startedAt,
    });

    return NextResponse.json({
      ok: true,
      durable: true,
      artifact_id: artifact.id,
      company_slug: artifact.company_slug,
      artifact_status: "INGESTED",
      file_type: metadata.artifact_key,
      batch_id: ingest.batch_id ?? null,
      elapsed_ms: Date.now() - startedAt,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Direct artifact ingestion failed.";
    const retryable = isRetryableIngestionTimeout(error);
    if (supabase && artifactId) {
      await markArtifact({
        supabase,
        artifactId,
        status: retryable ? "READY_FOR_INGEST" : "FAILED",
        metadata: {
          source: "runner_v2_direct_ingestion",
          phase: retryable
            ? "STORAGE_FALLBACK_RETRY_QUEUED"
            : "FALLBACK_REQUIRED",
          failed_at: new Date().toISOString(),
          retry_reason: retryable
            ? "DATABASE_STATEMENT_TIMEOUT"
            : null,
          error: message,
          ...(sourceRetention ? { source_retention: sourceRetention } : {}),
        },
        errorMessage: retryable ? null : message,
      }).catch(() => null);
    }
    console.error(
      JSON.stringify({
        event: "runner_v2_direct_ingestion_failed",
        artifact_id: artifactId,
        error: message,
        elapsed_ms: Date.now() - startedAt,
      })
    );
    return jsonError(
      message,
      retryable ? 503 : 422,
      Date.now() - startedAt
    );
  }
}
