import { createHash } from "node:crypto";
import { deriveDswSnapshotKind } from "@/features/operations/reports/dsw/dsw.metadata";
import {
  encryptTransientPackageIdentity,
  trackingReference,
} from "./packageStatus.crypto";
import { parseDswPackageStatusWorkbook } from "./packageStatus.parse";

type ArtifactContext = {
  id: string;
  service_date?: string | null;
  runner_artifact_json?: Record<string, unknown> | null;
};

export async function ingestDswPackageStatusWorkbook(params: {
  supabase: any;
  slug: string;
  buffer: Buffer;
  filename: string;
  artifact: ArtifactContext;
}) {
  const { supabase, slug, buffer, filename, artifact } = params;
  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id")
    .eq("company_slug", slug)
    .single();
  if (companyError || !company) throw new Error("Company not found.");

  const parsed = parseDswPackageStatusWorkbook(buffer);
  const metadata = artifact.runner_artifact_json ?? {};
  const runnerServiceDate = String(metadata.service_date_raw ?? "").trim();
  if (runnerServiceDate && runnerServiceDate !== parsed.service_date) {
    throw new Error(
      "Package status workbook date does not match its Runner metadata."
    );
  }
  if (
    artifact.service_date &&
    artifact.service_date !== parsed.service_date
  ) {
    throw new Error(
      "Package status workbook date does not match its collection artifact."
    );
  }
  const contractNumber = String(metadata.contract_number ?? "")
    .trim()
    .toUpperCase();
  if (!/^C\d+$/.test(contractNumber)) {
    throw new Error("Package status artifact is missing its contract number.");
  }

  const expectedCount = Number(metadata.expected_package_count);
  if (!Number.isInteger(expectedCount) || expectedCount < 0) {
    throw new Error("Package status artifact is missing a valid expected count.");
  }
  if (expectedCount !== parsed.rows.length) {
    throw new Error(
      `Package status count mismatch: DSW reported ${expectedCount}, workbook contains ${parsed.rows.length}.`
    );
  }

  const derivedSnapshotKind = deriveDswSnapshotKind(parsed.service_date);
  if (derivedSnapshotKind === "FUTURE") {
    throw new Error("Future-dated package status artifacts are not supported.");
  }
  const snapshotKind =
    derivedSnapshotKind === "IN_DAY" ? "LIVE" : "FINAL";

  const rows = parsed.rows.map((row) => ({
    ...trackingReference({
      companyId: company.id,
      trackingId: row.tracking_id,
    }),
    ...encryptTransientPackageIdentity({
      tracking_id: row.tracking_id,
      destination_address: row.destination_address,
    }),
    package_ordinal: row.package_ordinal,
    work_area_name: row.work_area_name,
    work_area_number: row.work_area_number,
    psa_csa: row.psa_csa,
    service_provider: row.service_provider,
    vision_label_raw: row.vision_label_raw,
    vision_label: row.vision_label,
    vision_label_at_local: row.vision_label_at_local,
    vehicle_number: row.vehicle_number,
    vsa_status_code: row.vsa_status_code,
    star_status_code: row.star_status_code,
    star_scan_at_local: row.star_scan_at_local,
  }));

  const sourceHash = createHash("sha256").update(buffer).digest("hex");
  const { data, error } = await supabase.rpc(
    "import_operations_dsw_package_status",
    {
      p_company_id: company.id,
      p_artifact_id: artifact.id,
      p_service_date: parsed.service_date,
      p_contract_number: contractNumber,
      p_snapshot_kind: snapshotKind,
      p_expected_count: expectedCount,
      p_source_filename: filename,
      p_source_hash: sourceHash,
      p_generated_at: parsed.generated_at,
      p_metadata_json: {
        source_contract: "DSW_ALL_STATUS_CODE_PACKAGES",
        terminal_identity: parsed.terminal_identity,
        detected_sheet_name: parsed.sheet_name,
        detected_header_row: parsed.header_row_number,
        expected_count_source: "DSW_CONTRACT_TOTAL_LINK",
      },
      p_rows: rows,
    }
  );
  if (error) throw new Error(error.message);

  const snapshotId =
    typeof data?.snapshot_id === "string" ? data.snapshot_id : null;
  if (!snapshotId) {
    throw new Error("Package status import did not return a snapshot ID.");
  }

  const { error: membershipError } = await supabase.rpc(
    "record_operations_dsw_package_status_snapshot_membership",
    {
      p_snapshot_id: snapshotId,
      p_company_id: company.id,
      p_service_date: parsed.service_date,
      p_tracking_refs: rows.map((row) => row.tracking_ref),
    }
  );
  if (membershipError) throw new Error(membershipError.message);

  return {
    ok: true,
    // Package-status snapshots live outside the legacy operations report
    // batch table, so their IDs must not populate the report_batch_id FK.
    batch_id: null,
    snapshot_id: snapshotId,
    report_family_key: "DSW",
    report_shape_key: "DSW_ALL_STATUS_CODE_PACKAGES",
    snapshot_kind: snapshotKind,
    service_date: parsed.service_date,
    contract_number: contractNumber,
    inserted_row_count: data?.inserted_row_count ?? rows.length,
    updated_row_count: data?.updated_row_count ?? 0,
    deleted_row_count: data?.deleted_row_count ?? 0,
    expected_package_count: expectedCount,
  };
}
