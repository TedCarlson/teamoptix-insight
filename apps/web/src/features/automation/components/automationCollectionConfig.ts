import type { CollectionProfile, CollectionTarget, ProtectedCollectionType } from "./automation.types";

export const COLLECTION_PROFILES: CollectionProfile[] = [
  {
    type: "PREVIOUS_DAY_CLOSE",
    title: "Previous Day Close",
    badge: "Automatic",
    tone: "blue",
    description: "Platform-managed daily closeout. Insight protects historical reporting by collecting the prior-day record every morning.",
    reports: ["Yesterday", "Daily close", "Historical completeness"],
    footer: "Runs automatically every day at 3:00 AM",
    priority: 60,
  },
  {
    type: "LAST_LOOK",
    title: "Last Look",
    badge: "Automatic",
    tone: "green",
    description: "Platform-managed final pass for today's operation before the day rolls.",
    reports: ["Today", "Targeted files", "Runner sign-off"],
    footer: "Runs automatically at 8:00 PM",
    priority: 70,
  },
  {
    type: "HISTORICAL_BACKFILL",
    title: "Time Machine",
    badge: "Onboarding",
    tone: "slate",
    description: "Recovers deep operational history so new Insight users can begin with intelligence on day one.",
    reports: ["Date range", "DSW only", "Trend baseline"],
    footer: "Purpose: recover the DSW story behind the operation",
    priority: 120,
  },
  {
    type: "TARGETED_RECOVERY",
    title: "Targeted Recovery",
    badge: "Manual",
    tone: "blue",
    description: "Runs one focused collection for selected file groups and runtime testing.",
    reports: ["Selected date", "Selected files", "Runtime telemetry"],
    footer: "Purpose: targeted runner test",
    priority: 90,
  },
];

export const COLLECTION_TARGETS: CollectionTarget[] = [
  {
    key: "DSW_DAILY_SERVICE",
    label: "DSW · Daily Service Worksheet",
    description: "Primary DSW route, stop, package, and driver fact source.",
    report_family_key: "DSW",
    artifact_key: "DSW",
    runner_section: "DAILY_SERVICE",
    vps_target: 11,
    expected_filename_match: ["daily service worksheet"],
    default_last_look: true,
    default_targeted: true,
  },
  {
    key: "P_AND_D_COMBINED_MANIFEST",
    label: "P&D · Combined Manifest",
    description: "Planning/last-look manifest target. Excluded from live freshness by default.",
    report_family_key: "FCC",
    artifact_key: "COMBINED_MANIFEST",
    runner_section: "P_AND_D",
    vps_target: 3,
    expected_filename_match: ["CombinedManifest", "CM_"],
    default_last_look: true,
    default_targeted: false,
  },
  {
    key: "FCC_WORK_AREA_SUMMARY",
    label: "FCC · Work Area Summary",
    description: "FedEx Work Area Summary from the Service Area Status page; live route heartbeat signal.",
    report_family_key: "FCC",
    artifact_key: "WORK_AREA_SUMMARY",
    report_shape_key: "FCC_WORK_AREA_SUMMARY",
    runner_section: "SERVICE",
    vps_target: 5,
    expected_filename_match: ["ServiceAreaStatus", "SAStatus_"],
    default_last_look: true,
    default_targeted: true,
  },
  {
    key: "P_AND_D_DELIVERY_MANIFEST",
    label: "P&D · Delivery Manifest",
    description: "Route-level delivery manifest. Use when combined manifest is not enough.",
    report_family_key: "FCC",
    artifact_key: "DELIVERY_MANIFEST",
    runner_section: "P_AND_D",
    vps_target: 2,
    expected_filename_match: ["DeliveryManifest"],
    default_last_look: false,
    default_targeted: false,
  },
  {
    key: "P_AND_D_PICKUP_MANIFEST",
    label: "P&D · Pickup Manifest",
    description: "Route-level pickup manifest. Use only when pickup detail is specifically needed.",
    report_family_key: "FCC",
    artifact_key: "PICKUP_MANIFEST",
    runner_section: "P_AND_D",
    vps_target: 1,
    expected_filename_match: ["PickupManifest", "PM"],
    default_last_look: false,
    default_targeted: false,
  },
];

export function defaultCollectionTargetKeys(profileType?: ProtectedCollectionType) {
  if (profileType === "TARGETED_RECOVERY") {
    return [];
  }

  if (profileType === "LAST_LOOK") {
    return COLLECTION_TARGETS.filter((target) => target.default_last_look).map((target) => target.key);
  }

  if (profileType === "HISTORICAL_BACKFILL") {
    return ["DSW_DAILY_SERVICE"];
  }

  return [];
}

export function selectedCollectionTargets(keys: string[]) {
  const selected = new Set(keys);
  return COLLECTION_TARGETS.filter((target) => selected.has(target.key));
}

export function requestedReportsFromTargets(targets: CollectionTarget[]) {
  return Array.from(new Set(targets.map((target) => target.report_family_key)));
}

export function todayIso() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function yesterdayIso() {
  const date = new Date(`${todayIso()}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function targetedRecoveryDateBounds() {
  const today = todayIso();
  const earliest = new Date(`${today}T12:00:00Z`);
  earliest.setUTCFullYear(earliest.getUTCFullYear() - 1);

  return {
    min: earliest.toISOString().slice(0, 10),
    max: yesterdayIso(),
  };
}
