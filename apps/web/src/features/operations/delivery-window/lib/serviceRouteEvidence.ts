export type DroPlanRow = {
  batch_id?: string | null;
  service_date?: string | null;
  report_frame?: "AM" | "PM" | string | null;
  route_baseline_id?: string | null;
  route_name?: string | null;
  wa_number?: string | null;
  stops?: number | null;
  packages?: number | null;
  time_commits?: number | null;
  miles?: number | string | null;
  planned_time?: number | string | null;
  miles_per_stop?: number | string | null;
  minutes_per_stop?: number | string | null;
};

export type RouteEvidencePresence = {
  dsw: boolean;
  dro: boolean;
  manifest: boolean;
  fcc: boolean;
  dispatch: boolean;
  identityConflict?: boolean;
};

export type RouteEvidenceStatus = {
  key: "complete" | "missing" | "conflict" | "none";
  label: string;
  missing: string[];
  tone: string;
  background: string;
};

export type ServiceActivityPresence = Pick<
  RouteEvidencePresence,
  "dsw" | "dro" | "manifest"
> & {
  fccActivity: boolean;
};

const REQUIRED_SOURCE_LABELS = [
  ["dro", "DRO"],
  ["dsw", "DSW"],
  ["manifest", "Manifest"],
  ["fcc", "FCC"],
] as const;

export function hasManifestRouteEvidence(
  health:
    | {
        artifacts?: { total?: number | null } | null;
        delivery?: { stop_count?: number | null; package_count?: number | null } | null;
        pickup?: { stop_count?: number | null } | null;
      }
    | null
    | undefined
) {
  if (!health) return false;
  return Boolean(
    Number(health.artifacts?.total ?? 0) > 0 ||
      Number(health.delivery?.stop_count ?? 0) > 0 ||
      Number(health.delivery?.package_count ?? 0) > 0 ||
      Number(health.pickup?.stop_count ?? 0) > 0
  );
}

export function hasServiceActivity(evidence: ServiceActivityPresence) {
  return Boolean(
    evidence.dsw ||
      evidence.dro ||
      evidence.manifest ||
      evidence.fccActivity
  );
}

export function routeEvidenceStatus(
  evidence: RouteEvidencePresence
): RouteEvidenceStatus {
  const missing = REQUIRED_SOURCE_LABELS.filter(([key]) => !evidence[key]).map(
    ([, label]) => label
  );
  const observed = REQUIRED_SOURCE_LABELS.length - missing.length;

  if (evidence.identityConflict) {
    return {
      key: "conflict",
      label: "Identity conflict",
      missing,
      tone: "#991b1b",
      background: "#fef2f2",
    };
  }

  if (missing.length === 0) {
    return {
      key: "complete",
      label: "Complete evidence",
      missing,
      tone: "#166534",
      background: "#ecfdf5",
    };
  }

  if (observed === 0) {
    return {
      key: "none",
      label: evidence.dispatch ? "Dispatch only" : "No source evidence",
      missing,
      tone: "#64748b",
      background: "#f1f5f9",
    };
  }

  return {
    key: "missing",
    label: `Missing ${missing.join(" · ")}`,
    missing,
    tone: "#92400e",
    background: "#fffbeb",
  };
}

export function sourceCoverage(
  routes: RouteEvidencePresence[]
) {
  return REQUIRED_SOURCE_LABELS.map(([key, label]) => ({
    key,
    label,
    represented: routes.filter((route) => route[key]).length,
    total: routes.length,
  }));
}
