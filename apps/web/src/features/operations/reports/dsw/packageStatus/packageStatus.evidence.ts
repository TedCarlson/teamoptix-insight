import { trackingReference } from "./packageStatus.crypto";

export type PackageEvidenceState =
  | "OPEN_CODED"
  | "COMPLETED"
  | "NEEDS_ATTENTION";

export type CurrentPackageStatusEvidence = {
  tracking_ref: string;
  work_area_name?: string | null;
  work_area_number?: string | null;
  vision_label?: string | null;
  vision_label_at_local?: string | null;
  vsa_status_code?: string | null;
  star_status_code?: string | null;
  star_scan_at_local?: string | null;
  snapshot_generated_at?: string | null;
};

export type EvidenceAnnotatedPackage = Record<string, unknown> & {
  delivery_evidence_state: PackageEvidenceState;
  delivery_evidence_basis:
    | "DSW_ALL_CODES"
    | "DSW_ALL_CODES_ABSENCE"
    | "TRACKING_GAP"
    | "EVIDENCE_CONFIGURATION_REQUIRED";
  status_code_source: "VSA" | "STAR" | "VSA_AND_STAR" | null;
  vsa_status_code: string | null;
  star_status_code: string | null;
  status_code_at_local: string | null;
  evidence_snapshot_generated_at: string | null;
};

export type ExpressEvidenceCounts = {
  package_count: number;
  completed_package_count: number;
  open_package_count: number;
  tracking_gap_package_count: number;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function truthy(value: unknown) {
  return value === true || text(value).toUpperCase() === "Y";
}

function meaningfulCode(value: unknown) {
  const normalized = text(value);
  return normalized && normalized !== "0" ? normalized : null;
}

function codeSource(
  vsaStatusCode: string | null,
  starStatusCode: string | null
) {
  if (vsaStatusCode && starStatusCode) return "VSA_AND_STAR" as const;
  if (vsaStatusCode) return "VSA" as const;
  if (starStatusCode) return "STAR" as const;
  return null;
}

export function packageEvidenceConfigurationAvailable() {
  return Boolean(process.env.TRACKING_REFERENCE_HMAC_KEY?.trim());
}

export function markPackageEvidenceUnavailable(
  packages: Array<Record<string, unknown>>
) {
  return packages.map<EvidenceAnnotatedPackage>((packageRow) => ({
    ...packageRow,
    delivery_evidence_state: "NEEDS_ATTENTION",
    delivery_evidence_basis: "EVIDENCE_CONFIGURATION_REQUIRED",
    status_code_source: null,
    vsa_status_code: null,
    star_status_code: null,
    status_code_at_local: null,
    evidence_snapshot_generated_at: null,
  }));
}

export function annotateManifestPackageEvidence(params: {
  companyId: string;
  packages: Array<Record<string, unknown>>;
  currentStatusRows: CurrentPackageStatusEvidence[];
}) {
  const evidenceByReference = new Map(
    params.currentStatusRows.map((row) => [row.tracking_ref, row])
  );

  return params.packages.map<EvidenceAnnotatedPackage>((packageRow) => {
    const trackingId = text(packageRow.tracking_id);
    if (!trackingId) {
      return {
        ...packageRow,
        delivery_evidence_state: "NEEDS_ATTENTION",
        delivery_evidence_basis: "TRACKING_GAP",
        status_code_source: null,
        vsa_status_code: null,
        star_status_code: null,
        status_code_at_local: null,
        evidence_snapshot_generated_at: null,
      };
    }

    const { tracking_ref: trackingRef } = trackingReference({
      companyId: params.companyId,
      trackingId,
    });
    const currentEvidence = evidenceByReference.get(trackingRef);
    if (!currentEvidence) {
      return {
        ...packageRow,
        delivery_evidence_state: "COMPLETED",
        delivery_evidence_basis: "DSW_ALL_CODES_ABSENCE",
        status_code_source: null,
        vsa_status_code: null,
        star_status_code: null,
        status_code_at_local: null,
        evidence_snapshot_generated_at: null,
      };
    }

    const vsaStatusCode = meaningfulCode(currentEvidence.vsa_status_code);
    const starStatusCode = meaningfulCode(currentEvidence.star_status_code);
    return {
      ...packageRow,
      delivery_evidence_state: "OPEN_CODED",
      delivery_evidence_basis: "DSW_ALL_CODES",
      status_code_source: codeSource(vsaStatusCode, starStatusCode),
      vsa_status_code: vsaStatusCode,
      star_status_code: starStatusCode,
      status_code_at_local:
        currentEvidence.star_scan_at_local ??
        currentEvidence.vision_label_at_local ??
        null,
      evidence_snapshot_generated_at:
        currentEvidence.snapshot_generated_at ?? null,
    };
  });
}

export function expressEvidenceCountsByRoute(
  packages: EvidenceAnnotatedPackage[]
) {
  const countsByRoute = new Map<string, ExpressEvidenceCounts>();

  packages.forEach((packageRow) => {
    if (!truthy(packageRow.is_express)) return;
    const routeKey = text(packageRow.route_key);
    if (!routeKey) return;
    const counts = countsByRoute.get(routeKey) ?? {
      package_count: 0,
      completed_package_count: 0,
      open_package_count: 0,
      tracking_gap_package_count: 0,
    };
    counts.package_count += 1;
    if (packageRow.delivery_evidence_state === "OPEN_CODED") {
      counts.open_package_count += 1;
    } else if (packageRow.delivery_evidence_state === "COMPLETED") {
      counts.completed_package_count += 1;
    } else {
      counts.tracking_gap_package_count += 1;
    }
    countsByRoute.set(routeKey, counts);
  });

  return countsByRoute;
}
