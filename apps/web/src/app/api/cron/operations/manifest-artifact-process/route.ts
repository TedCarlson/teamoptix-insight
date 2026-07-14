import { NextRequest, NextResponse } from "next/server";
import { processCapturedManifestArtifacts } from "@/features/operations/manifests/manifest.processor";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

function parseLimit(req: NextRequest) {
  const raw = Number(req.nextUrl.searchParams.get("limit") ?? "10");

  if (!Number.isFinite(raw)) return 10;

  return Math.max(1, Math.min(25, Math.trunc(raw)));
}

export async function GET(req: NextRequest) {
  const startedAt = Date.now();

  try {
    const supabase = createSupabaseServiceRoleClient();
    const { data: promoted, error: promoteError } = await supabase.rpc(
      "promote_operations_collection_manifest_artifacts",
      {
        p_collection_request_id: null,
        p_limit: parseLimit(req),
      }
    );

    if (promoteError) {
      throw new Error(promoteError.message);
    }

    const processed = await processCapturedManifestArtifacts({
      supabase,
      limit: parseLimit(req),
    });

    return NextResponse.json({
      ok: true,
      promoted,
      processed_count: processed.length,
      processed,
      elapsed_ms: Date.now() - startedAt,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Manifest artifact processor failed.",
        elapsed_ms: Date.now() - startedAt,
      },
      { status: 500 }
    );
  }
}
