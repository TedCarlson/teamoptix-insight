import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import sharp from "sharp";

export const runtime = "nodejs";
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const form = await req.formData();
  const file = form.get("file");
  const vehicleId = String(form.get("vehicle_id") ?? "");
  const itemKey = String(form.get("item_key") ?? "evidence").replace(/[^a-zA-Z0-9_-]/g, "");
  if (!(file instanceof File) || !vehicleId) return NextResponse.json({ error: "Photo and vehicle are required." }, { status: 400 });
  if (!allowedTypes.has(file.type) || file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "Use a JPG, PNG, or WebP photo under 10 MB." }, { status: 400 });

  const session = await getSupabaseServerClient();
  const { data: vehicle } = await session.from("company_fleet_vehicle_v").select("vehicle_id").eq("company_slug", slug).eq("vehicle_id", vehicleId).maybeSingle();
  if (!vehicle) return NextResponse.json({ error: "Vehicle is unavailable." }, { status: 403 });

  let sanitized: Buffer;
  try {
    sanitized = await sharp(Buffer.from(await file.arrayBuffer()), {
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

  const path = `${slug}/${vehicleId}/pending/${crypto.randomUUID()}-${itemKey}.webp`;
  const sourceHash = createHash("sha256").update(sanitized).digest("hex");
  const admin = createSupabaseServiceRoleClient();
  const { error } = await admin.storage.from("fleet-inspection-evidence").upload(path, sanitized, { contentType: "image/webp", upsert: false });
  if (error) return NextResponse.json({ error: "Photo upload failed.", detail: error.message }, { status: 500 });

  const { data: evidenceId, error: registerError } = await session.rpc(
    "register_company_fleet_inspection_evidence",
    {
      p_company_slug: slug,
      p_vehicle_id: vehicleId,
      p_item_key: itemKey,
      p_storage_bucket: "fleet-inspection-evidence",
      p_storage_path: path,
      p_content_type: "image/webp",
      p_size_bytes: sanitized.length,
      p_sha256: sourceHash,
    }
  );

  if (registerError) {
    await admin.storage.from("fleet-inspection-evidence").remove([path]);
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
