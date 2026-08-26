import { NextRequest, NextResponse } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import {
  removeFleetInspectionEvidence,
  storeFleetInspectionEvidence,
} from "@/features/fleet/evidence/backblaze.server";
import sharp from "sharp";

export const runtime = "nodejs";
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const allowedItemKeys = new Set([
  "service_brakes", "parking_brake", "steering", "horn", "seat_belt",
  "lights", "wipers", "mirrors", "tires", "wheels", "doors", "steps",
  "leaks", "exterior_front", "exterior_rear", "exterior_driver",
  "exterior_passenger", "equipment", "documents",
]);
const maxSourceBytes = 10 * 1024 * 1024;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function authenticatedClient(req: NextRequest) {
  const authorization = req.headers.get("authorization");
  if (!authorization?.match(/^Bearer\s+\S+$/i)) return getSupabaseServerClient();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Missing Supabase server environment variables.");
  return Promise.resolve(createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: authorization } },
  }));
}

function safeSegment(value: string, fallback: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80) || fallback;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const contentType = req.headers.get("content-type") ?? "";
  let source: Buffer;
  let sourceType: string;
  let vehicleId: string;
  let itemKey: string;
  let objectSuffix: string;
  if (contentType.includes("application/json")) {
    const body = await req.json() as Record<string, unknown>;
    sourceType = String(body.content_type ?? "");
    vehicleId = String(body.vehicle_id ?? "");
    itemKey = String(body.item_key ?? "");
    const submissionId = String(body.device_submission_id ?? "");
    const sequence = Number(body.sequence ?? 0);
    if (!uuidPattern.test(submissionId) || !Number.isInteger(sequence) || sequence < 0 || sequence > 20) {
      return NextResponse.json({ error: "Inspection evidence identity is invalid." }, { status: 400 });
    }
    try {
      source = Buffer.from(String(body.base64 ?? ""), "base64");
    } catch {
      source = Buffer.alloc(0);
    }
    objectSuffix = `${submissionId}-${itemKey}-${sequence}.webp`;
  } else {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Photo and vehicle are required." }, { status: 400 });
    source = Buffer.from(await file.arrayBuffer());
    sourceType = file.type;
    vehicleId = String(form.get("vehicle_id") ?? "");
    itemKey = String(form.get("item_key") ?? "");
    objectSuffix = `${randomUUID()}-${itemKey}.webp`;
  }
  if (!uuidPattern.test(vehicleId) || !allowedItemKeys.has(itemKey) || !allowedTypes.has(sourceType) || source.length === 0 || source.length > maxSourceBytes) {
    return NextResponse.json({ error: "Use a JPG, PNG, or WebP inspection photo under 10 MB." }, { status: 400 });
  }

  const session = await authenticatedClient(req);
  const { data: vehicle } = await session.from("company_fleet_vehicle_v").select("vehicle_id").eq("company_slug", slug).eq("vehicle_id", vehicleId).maybeSingle();
  if (!vehicle) return NextResponse.json({ error: "Vehicle is unavailable." }, { status: 403 });

  let sanitized: Buffer;
  try {
    sanitized = await sharp(source, {
      failOn: "warning",
      limitInputPixels: 40_000_000,
    })
      .rotate()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 78, effort: 5, smartSubsample: true })
      .toBuffer();
  } catch {
    return NextResponse.json({ error: "The photo could not be safely processed." }, { status: 400 });
  }

  const path = `company=${safeSegment(slug, "company")}/vehicle=${vehicleId}/inspection=pending/${objectSuffix}`;
  const sourceHash = createHash("sha256").update(sanitized).digest("hex");
  const admin = createSupabaseServiceRoleClient();
  const existing = await admin
    .schema("fleet")
    .from("inspection_evidence_object")
    .select("id,vehicle_id,sha256,archive_status,archive_bucket,archive_etag")
    .eq("hot_storage_path", path)
    .maybeSingle();
  if (existing.data) {
    if (existing.data.vehicle_id !== vehicleId || existing.data.sha256 !== sourceHash) {
      return NextResponse.json({ error: "Inspection evidence retry conflict." }, { status: 409 });
    }
    if (existing.data.archive_status === "ARCHIVED") {
      return NextResponse.json({
        ok: true,
        evidence_id: existing.data.id,
        storage_path: path,
        size_bytes: sanitized.length,
        sha256: sourceHash,
      });
    }
  }

  let stored: Awaited<ReturnType<typeof storeFleetInspectionEvidence>>;
  try {
    stored = await storeFleetInspectionEvidence({ body: sanitized, key: path, sha256: sourceHash });
  } catch {
    return NextResponse.json({ error: "Photo upload failed." }, { status: 500 });
  }

  let evidenceId = existing.data?.id ?? null;
  let registerError = null;
  if (!evidenceId) {
    const registration = await session.rpc(
      "register_company_fleet_inspection_evidence",
      {
        p_company_slug: slug,
        p_vehicle_id: vehicleId,
        p_item_key: itemKey,
        p_storage_bucket: stored.bucket,
        p_storage_path: path,
        p_content_type: "image/webp",
        p_size_bytes: sanitized.length,
        p_sha256: sourceHash,
      }
    );
    evidenceId = registration.data;
    registerError = registration.error;
  }

  if (registerError || !evidenceId) {
    await removeFleetInspectionEvidence(path).catch(() => undefined);
    return NextResponse.json({ error: "Photo evidence registration failed." }, { status: 500 });
  }

  const archivedAt = new Date().toISOString();
  const { error: archiveError } = await admin
    .schema("fleet")
    .from("inspection_evidence_object")
    .update({
      archive_status: "ARCHIVED",
      archive_provider: "BACKBLAZE_B2",
      archive_bucket: stored.bucket,
      archive_key: stored.key,
      archive_etag: stored.etag,
      archived_at: archivedAt,
      hot_deleted_at: archivedAt,
      updated_at: archivedAt,
    })
    .eq("id", evidenceId);
  if (archiveError) {
    await removeFleetInspectionEvidence(path).catch(() => undefined);
    return NextResponse.json({ error: "Photo evidence registration failed." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    evidence_id: evidenceId,
    storage_path: path,
    size_bytes: sanitized.length,
    sha256: sourceHash,
  });
}
