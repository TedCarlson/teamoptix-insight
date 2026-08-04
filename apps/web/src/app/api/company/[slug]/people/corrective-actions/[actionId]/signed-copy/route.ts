import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

const bucket = "corrective-action-evidence";
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

async function loadAuthorizedAction(slug: string, actionId: string) {
  const session = await getSupabaseServerClient();
  const { data, error } = await session.rpc("get_company_corrective_action", { p_company_slug: slug, p_action_id: actionId });
  if (error || !data?.action) return { session, data: null, error: error?.message || "Corrective action not found." };
  return { session, data, error: null };
}

export async function GET(_request: NextRequest, context: { params: Promise<{ slug: string; actionId: string }> }) {
  const { slug, actionId } = await context.params;
  const { data, error } = await loadAuthorizedAction(slug, actionId);
  if (error || !data) return NextResponse.json({ error }, { status: 404 });

  const admin = createSupabaseServiceRoleClient();
  const copies = await Promise.all((data.evidence ?? []).filter((item: Record<string, unknown>) => item.source_kind === "SIGNED_COPY").map(async (item: Record<string, any>) => {
    const { data: signed } = await admin.storage.from(bucket).createSignedUrl(String(item.storage_path), 900);
    return { id: item.id, reconciliation_id: item.source_id, created_at: item.created_at, size_bytes: item.metadata?.normalized_size_bytes ?? null, url: signed?.signedUrl ?? null };
  }));
  return NextResponse.json({ copies });
}

export async function POST(request: NextRequest, context: { params: Promise<{ slug: string; actionId: string }> }) {
  const { slug, actionId } = await context.params;
  const form = await request.formData();
  const file = form.get("file");
  const reconciliationId = String(form.get("reconciliation_id") ?? "").trim().toUpperCase();
  if (!(file instanceof File) || !reconciliationId) return NextResponse.json({ error: "Reconciliation ID and signed-copy photo are required." }, { status: 400 });
  if (!allowedTypes.has(file.type) || file.size > 15 * 1024 * 1024) return NextResponse.json({ error: "Use a JPG, PNG, or WebP image under 15 MB." }, { status: 400 });

  const { session, data, error } = await loadAuthorizedAction(slug, actionId);
  if (error || !data) return NextResponse.json({ error }, { status: 404 });
  const action = data.action;
  if (!["ISSUED", "FINALIZED"].includes(String(action.workflow_status)) || !action.content_hash) return NextResponse.json({ error: "Issue the CAN before reconciling a signed copy." }, { status: 400 });
  const expectedId = `CAN-${action.can_number}-${String(action.content_hash).slice(0, 12).toUpperCase()}`;
  if (reconciliationId !== expectedId) return NextResponse.json({ error: "Reconciliation ID does not match this CAN." }, { status: 400 });

  const original = Buffer.from(await file.arrayBuffer());
  let normalized: Buffer;
  try {
    normalized = await sharp(original, { failOn: "warning", limitInputPixels: 50_000_000 })
      .rotate()
      .resize({ width: 2200, height: 3200, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82, effort: 5, smartSubsample: true })
      .toBuffer();
  } catch {
    return NextResponse.json({ error: "The signed-copy image could not be safely processed." }, { status: 400 });
  }

  const captureId = crypto.randomUUID();
  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const basePath = `${slug}/${actionId}/signed/${captureId}`;
  const originalPath = `${basePath}-original.${extension}`;
  const normalizedPath = `${basePath}-normalized.webp`;
  const admin = createSupabaseServiceRoleClient();
  const { error: originalError } = await admin.storage.from(bucket).upload(originalPath, original, { contentType: file.type, upsert: false });
  if (originalError) return NextResponse.json({ error: "Signed-copy upload failed." }, { status: 500 });
  const { error: normalizedError } = await admin.storage.from(bucket).upload(normalizedPath, normalized, { contentType: "image/webp", upsert: false });
  if (normalizedError) {
    await admin.storage.from(bucket).remove([originalPath]);
    return NextResponse.json({ error: "Signed-copy normalization failed." }, { status: 500 });
  }

  const payload = {
    original_storage_bucket: bucket,
    original_storage_path: originalPath,
    original_content_type: file.type,
    original_size_bytes: original.length,
    original_sha256: createHash("sha256").update(original).digest("hex"),
    normalized_storage_bucket: bucket,
    normalized_storage_path: normalizedPath,
    normalized_content_type: "image/webp",
    normalized_size_bytes: normalized.length,
    normalized_sha256: createHash("sha256").update(normalized).digest("hex"),
  };
  const { data: registered, error: registerError } = await session.rpc("register_company_corrective_action_signed_copy", { p_company_slug: slug, p_action_id: actionId, p_reconciliation_id: reconciliationId, p_payload: payload });
  if (registerError) {
    await admin.storage.from(bucket).remove([originalPath, normalizedPath]);
    return NextResponse.json({ error: registerError.message }, { status: 400 });
  }
  return NextResponse.json(registered);
}
