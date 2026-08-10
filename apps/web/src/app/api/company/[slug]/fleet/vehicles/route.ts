import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { hasCompanyWorkspaceAccess } from "@/features/company/config/companyWorkspaceAccess.server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { validateVin } from "@/features/fleet/lib/vin";
import sharp from "sharp";

const value = (input: unknown) => typeof input === "string" ? input.trim() : "";
const numberOrNull = (input: unknown) => input === "" || input == null ? null : Number(input);
const allowedEvidenceTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const intakePhotoKinds = ["DASH_ODOMETER","VEHICLE_FRONT","VEHICLE_REAR","DRIVER_SIDE","PASSENGER_SIDE","TIRES","CERTIFICATION_LABEL"] as const;
type EvidenceInput = { kind: string; method: string; file: File };
type PreparedEvidence = EvidenceInput & { original: Buffer; normalized: Buffer };
export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await getSupabaseServerClient();
  if (!(await hasCompanyWorkspaceAccess(supabase, slug, "fleet"))) {
    return NextResponse.json({ error: "Fleet access is required." }, { status: 403 });
  }

  const contentType = req.headers.get("content-type") ?? "";
  const form = contentType.includes("multipart/form-data") ? await req.formData() : null;
  const body: Record<string, unknown> = form
    ? Object.fromEntries(Array.from(form.entries()).filter(([, entry]) => !(entry instanceof File)))
    : await req.json().catch(() => ({}));
  const evidenceInputs: EvidenceInput[] = [];
  const vinEvidence = form?.get("vin_evidence_file");
  if (vinEvidence instanceof File) evidenceInputs.push({ kind: "VIN_LABEL", method: "BARCODE_AUTO_CAPTURE", file: vinEvidence });
  for (const kind of intakePhotoKinds) {
    for (const entry of form?.getAll(`intake_photo_${kind}`) ?? []) {
      if (entry instanceof File) evidenceInputs.push({ kind, method: "MANUAL_CAPTURE", file: entry });
    }
  }
  if (evidenceInputs.length > 12) return NextResponse.json({ error: "Attach no more than 12 intake photographs at once." }, { status: 400 });
  for (const evidence of evidenceInputs) {
    if (!allowedEvidenceTypes.has(evidence.file.type) || evidence.file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "Use JPG, PNG, or WebP intake photographs under 10 MB each." }, { status: 400 });
    }
  }

  const vinInput = value(body.vin);
  const vin = vinInput ? validateVin(vinInput) : null;
  if (vin && !vin.valid) return NextResponse.json({ error: vin.error }, { status: 400 });
  const unitNumber = value(body.unit_number) || (vin?.valid ? `VIN-${vin.vin}` : "");
  if (!unitNumber) return NextResponse.json({ error: "Scan a VIN or enter a unit number to create the intake record." }, { status: 400 });

  const preparedEvidence: PreparedEvidence[] = [];
  for (const evidence of evidenceInputs) {
    const original = Buffer.from(await evidence.file.arrayBuffer());
    try {
      const normalized = await sharp(original, { failOn: "warning", limitInputPixels: 40_000_000 })
        .rotate().resize({ width: 2200, height: 2200, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 86, effort: 5, smartSubsample: true }).toBuffer();
      preparedEvidence.push({ ...evidence, original, normalized });
    } catch {
      return NextResponse.json({ error: "One of the intake photographs could not be safely processed." }, { status: 400 });
    }
  }

  const { data, error } = await supabase.rpc("upsert_company_fleet_vehicle", {
    p_company_slug: slug, p_vehicle_id: value(body.vehicle_id) || null, p_unit_number: unitNumber,
    p_vehicle_class_key: value(body.vehicle_id) ? value(body.vehicle_class_key) || null : null,
    p_vehicle_type: value(body.vehicle_type) || "STEP_VAN",
    p_status: value(body.status) || (value(body.vehicle_id) ? "READY" : "INTAKE"),
    p_year: numberOrNull(body.year), p_make: value(body.make), p_model: value(body.model), p_vin: vin?.vin ?? "",
    p_plate_number: value(body.plate_number), p_plate_state: value(body.plate_state), p_odometer_miles: numberOrNull(body.odometer_miles),
    p_wheel_size: value(body.wheel_size), p_front_tire_size: value(body.front_tire_size), p_rear_tire_size: value(body.rear_tire_size),
    p_rear_tire_configuration: value(body.rear_tire_configuration), p_tire_type: value(body.tire_type),
    p_gvwr_lbs: numberOrNull(body.gvwr_lbs), p_gvwr_source: value(body.gvwr_source) || null,
    p_gvwr_verified_status: value(body.gvwr_verified_status) || "UNVERIFIED",
    p_gvwr_evidence_reference: value(body.gvwr_evidence_reference) || null,
    p_effective_start_date: value(body.effective_start_date) || new Date().toISOString().slice(0, 10),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const decodeId = value(body.vin_decode_id);
  let warning = "";
  if (decodeId && data) {
    const { error: linkError } = await supabase.rpc("link_company_fleet_vin_decode", { p_company_slug: slug, p_decode_id: decodeId, p_vehicle_id: data });
    if (linkError) warning = `Vehicle saved, but VIN decode provenance was not linked: ${linkError.message}`;
  }

  const evidenceIds: string[] = [];
  if (preparedEvidence.length && data) {
    const admin = createSupabaseServiceRoleClient();
    const uploadedPaths: string[] = [];
    const rollbackNewVehicle = async () => {
      if (!value(body.vehicle_id)) await admin.schema("fleet").from("vehicle").delete().eq("id", data);
    };
    const cleanup = async () => {
      if (uploadedPaths.length) await admin.storage.from("fleet-inspection-evidence").remove(uploadedPaths);
      if (evidenceIds.length) await admin.schema("fleet").from("vehicle_intake_evidence").delete().in("id", evidenceIds);
      await rollbackNewVehicle();
    };
    for (const evidence of preparedEvidence) {
      const captureId = crypto.randomUUID();
      const extension = evidence.file.type === "image/png" ? "png" : evidence.file.type === "image/webp" ? "webp" : "jpg";
      const basePath = `${slug}/${data}/intake/${evidence.kind.toLowerCase()}/${captureId}`;
      const originalPath = `${basePath}-original.${extension}`;
      const normalizedPath = `${basePath}-normalized.webp`;
      const { error: originalError } = await admin.storage.from("fleet-inspection-evidence").upload(originalPath, evidence.original, { contentType: evidence.file.type, upsert: false });
      if (originalError) { await cleanup(); return NextResponse.json({ error: "Intake photographs could not be uploaded, so the vehicle was not saved." }, { status: 500 }); }
      uploadedPaths.push(originalPath);
      const { error: normalizedError } = await admin.storage.from("fleet-inspection-evidence").upload(normalizedPath, evidence.normalized, { contentType: "image/webp", upsert: false });
      if (normalizedError) { await cleanup(); return NextResponse.json({ error: "Intake photographs could not be normalized, so the vehicle was not saved." }, { status: 500 }); }
      uploadedPaths.push(normalizedPath);
      const { data: evidenceId, error: registerError } = await supabase.rpc("register_company_fleet_vehicle_intake_evidence", {
        p_company_slug: slug, p_vehicle_id: data, p_vin_decode_id: evidence.kind === "VIN_LABEL" ? decodeId || null : null,
        p_capture_kind: evidence.kind, p_capture_method: evidence.method,
        p_original_storage_bucket: "fleet-inspection-evidence", p_original_storage_path: originalPath,
        p_original_content_type: evidence.file.type, p_original_size_bytes: evidence.original.length,
        p_original_sha256: createHash("sha256").update(evidence.original).digest("hex"),
        p_normalized_storage_bucket: "fleet-inspection-evidence", p_normalized_storage_path: normalizedPath,
        p_normalized_size_bytes: evidence.normalized.length,
        p_normalized_sha256: createHash("sha256").update(evidence.normalized).digest("hex"),
      });
      if (registerError) { await cleanup(); return NextResponse.json({ error: "Intake photograph registration failed, so the vehicle was not saved." }, { status: 500 }); }
      evidenceIds.push(evidenceId);
    }
  }
  return NextResponse.json({ ok: true, vehicle_id: data, evidence_ids: evidenceIds, warning: warning || undefined });
}
