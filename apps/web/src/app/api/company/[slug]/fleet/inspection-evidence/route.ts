import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

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

  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${slug}/${vehicleId}/pending/${crypto.randomUUID()}-${itemKey}.${extension}`;
  const admin = createSupabaseServiceRoleClient();
  const { error } = await admin.storage.from("fleet-inspection-evidence").upload(path, file, { contentType: file.type, upsert: false });
  if (error) return NextResponse.json({ error: "Photo upload failed.", detail: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, storage_path: path });
}
