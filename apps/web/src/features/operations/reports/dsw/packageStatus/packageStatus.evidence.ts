import { trackingReference } from "./packageStatus.crypto";

export type PackageEvidenceState =
  | "OPEN"
  | "CODED_ATTEMPT"
  | "COMPLETED";

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
    | "MANIFEST_COMPLETED"
    | "MANIFEST_OPEN"
    | "TRACKING_IDENTITY_MISSING"
    | "EVIDENCE_CONFIGURATION_REQUIRED";
  delivery_data_health: Array<
    | "TRACKING_IDENTITY_MISSING"
    | "REFERENCE_MATCH_UNAVAILABLE"
    | "STOP_LINK_MISSING"
    | "STOP_LINK_AMBIGUOUS"
  >;
  status_code_source: "VSA" | "STAR" | "VSA_AND_STAR" | null;
  vsa_status_code: string | null;
  star_status_code: string | null;
  status_code_at_local: string | null;
  evidence_snapshot_generated_at: string | null;
};

export type ExpressEvidenceCounts = {
  package_count: number;
  complete_package_count: number;
  attempted_package_count: number;
  open_package_count: number;
  tracking_identity_missing_count: number;
  stop_link_missing_count: number;
  stop_link_ambiguous_count: number;
  reference_match_available: boolean;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function truthy(value: unknown) {
  return value === true || text(value).toUpperCase() === "Y";
}

function manifestCompleted(packageRow: Record<string, unknown>) {
  return truthy(
    packageRow.manifest_completed ?? packageRow.completed
  );
}

function manifestLinkHealth(packageRow: Record<string, unknown>) {
  const status = text(packageRow.manifest_stop_link_status).toUpperCase();
  if (status === "MISSING") return ["STOP_LINK_MISSING" as const];
  if (status === "AMBIGUOUS") return ["STOP_LINK_AMBIGUOUS" as const];
  if (packageRow.manifest_stop_linked === false) {
    return ["STOP_LINK_MISSING" as const];
  }
  return [];
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

export function packageEvidenceAvailableForPackages(
  packages: Array<Record<string, unknown>>
) {
  if (packageEvidenceConfigurationAvailable()) return true;
  return packages
    .filter((packageRow) => Boolean(text(packageRow.tracking_id)))
    .every((packageRow) => /^v[0-9]+_[a-f0-9]{64}$/.test(text(packageRow.tracking_ref)));
}

export function markPackageEvidenceUnavailable(
  packages: Array<Record<string, unknown>>
) {
  return packages.map<EvidenceAnnotatedPackage>((packageRow) => {
    const completed = manifestCompleted(packageRow);
    return {
      ...packageRow,
      delivery_evidence_state: completed ? "COMPLETED" : "OPEN",
      delivery_evidence_basis: completed
        ? "MANIFEST_COMPLETED"
        : "EVIDENCE_CONFIGURATION_REQUIRED",
      delivery_data_health: completed
        ? manifestLinkHealth(packageRow)
        : [...manifestLinkHealth(packageRow), "REFERENCE_MATCH_UNAVAILABLE"],
      status_code_source: null,
      vsa_status_code: null,
      star_status_code: null,
      status_code_at_local: null,
      evidence_snapshot_generated_at: null,
    };
  });
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
        delivery_evidence_state: "OPEN",
        delivery_evidence_basis: "TRACKING_IDENTITY_MISSING",
        delivery_data_health: [
          ...manifestLinkHealth(packageRow),
          "TRACKING_IDENTITY_MISSING",
        ],
        status_code_source: null,
        vsa_status_code: null,
        star_status_code: null,
        status_code_at_local: null,
        evidence_snapshot_generated_at: null,
      };
    }

    const persistedTrackingRef = text(packageRow.tracking_ref);
    const trackingRef = /^v[0-9]+_[a-f0-9]{64}$/.test(persistedTrackingRef)
      ? persistedTrackingRef
      : trackingReference({
          companyId: params.companyId,
          trackingId,
        }).tracking_ref;
    if (manifestCompleted(packageRow)) {
      return {
        ...packageRow,
        delivery_evidence_state: "COMPLETED",
        delivery_evidence_basis: "MANIFEST_COMPLETED",
        delivery_data_health: manifestLinkHealth(packageRow),
        status_code_source: null,
        vsa_status_code: null,
        star_status_code: null,
        status_code_at_local: null,
        evidence_snapshot_generated_at: null,
      };
    }

    const currentEvidence = evidenceByReference.get(trackingRef);
    if (!currentEvidence) {
      return {
        ...packageRow,
        delivery_evidence_state: "OPEN",
        delivery_evidence_basis: "MANIFEST_OPEN",
        delivery_data_health: manifestLinkHealth(packageRow),
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
      delivery_evidence_state: "CODED_ATTEMPT",
      delivery_evidence_basis: "DSW_ALL_CODES",
      delivery_data_health: manifestLinkHealth(packageRow),
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
      complete_package_count: 0,
      attempted_package_count: 0,
      open_package_count: 0,
      tracking_identity_missing_count: 0,
      stop_link_missing_count: 0,
      stop_link_ambiguous_count: 0,
      reference_match_available: true,
    };
    counts.package_count += 1;
    if (packageRow.delivery_evidence_state === "OPEN") {
      counts.open_package_count += 1;
    } else if (packageRow.delivery_evidence_state === "CODED_ATTEMPT") {
      counts.attempted_package_count += 1;
    } else if (packageRow.delivery_evidence_state === "COMPLETED") {
      counts.complete_package_count += 1;
    }
    if (packageRow.delivery_data_health.includes("TRACKING_IDENTITY_MISSING")) {
      counts.tracking_identity_missing_count += 1;
    }
    if (packageRow.delivery_data_health.includes("STOP_LINK_MISSING")) {
      counts.stop_link_missing_count += 1;
    }
    if (packageRow.delivery_data_health.includes("STOP_LINK_AMBIGUOUS")) {
      counts.stop_link_ambiguous_count += 1;
    }
    if (packageRow.delivery_data_health.includes("REFERENCE_MATCH_UNAVAILABLE")) {
      counts.reference_match_available = false;
    }
    countsByRoute.set(routeKey, counts);
  });

  return countsByRoute;
}
