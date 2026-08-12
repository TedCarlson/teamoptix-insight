export type ManagerRoute = {
  id: string;
  routeName: string;
  currentWaNumber: string | null;
  routeLocation: string | null;
  routeType: string;
  thresholdStops: number | null;
  thresholdRate: number | null;
  runs: Record<ManagerRouteDayKey, boolean>;
  rotationName: string | null;
  isActive: boolean;
  effectiveStart: string;
  effectiveEnd: string | null;
};

export type ManagerRouteDayKey = "s" | "u" | "m" | "t" | "w" | "h" | "f";

export type ManagerRoutesSnapshot = {
  activeRoutes: ManagerRoute[];
  history: ManagerRoute[];
  coreCount: number;
  thresholdCount: number;
};

export type ManagerRouteDraft = {
  routeName: string;
  currentWaNumber: string;
  routeLocation: string;
  routeType: "CORE" | "PEAK" | "OVERFLOW";
  thresholdStops: string;
  thresholdRate: string;
  runs: Record<ManagerRouteDayKey, boolean>;
  rotationName: string;
  isActive: boolean;
};

export const MANAGER_ROUTE_DAYS: Array<{ key: ManagerRouteDayKey; label: string }> = [
  { key: "s", label: "Sat" },
  { key: "u", label: "Sun" },
  { key: "m", label: "Mon" },
  { key: "t", label: "Tue" },
  { key: "w", label: "Wed" },
  { key: "h", label: "Thu" },
  { key: "f", label: "Fri" },
];

export function emptyManagerRouteDraft(): ManagerRouteDraft {
  return {
    routeName: "",
    currentWaNumber: "",
    routeLocation: "",
    routeType: "CORE",
    thresholdStops: "",
    thresholdRate: "",
    runs: { s: true, u: true, m: true, t: true, w: true, h: true, f: true },
    rotationName: "",
    isActive: true,
  };
}

export function managerRouteDraft(route: ManagerRoute): ManagerRouteDraft {
  return {
    routeName: route.routeName,
    currentWaNumber: route.currentWaNumber ?? "",
    routeLocation: route.routeLocation ?? "",
    routeType: ["CORE", "PEAK", "OVERFLOW"].includes(route.routeType)
      ? route.routeType as ManagerRouteDraft["routeType"]
      : "CORE",
    thresholdStops: route.thresholdStops == null ? "" : String(route.thresholdStops),
    thresholdRate: route.thresholdRate == null ? "" : String(route.thresholdRate),
    runs: { ...route.runs },
    rotationName: route.rotationName ?? "",
    isActive: route.isActive,
  };
}

export function validateManagerRouteDraft(draft: ManagerRouteDraft) {
  if (!draft.routeName.trim()) return "Enter the route name.";
  if (!Object.values(draft.runs).some(Boolean)) return "Choose at least one operating day.";
  if (draft.thresholdStops.trim()) {
    const stops = Number(draft.thresholdStops);
    if (!Number.isInteger(stops) || stops < 0) return "Threshold stops must be a whole number at or above zero.";
  }
  if (draft.thresholdRate.trim()) {
    const rate = Number(draft.thresholdRate);
    if (!Number.isFinite(rate) || rate < 0) return "Threshold rate must be at or above zero.";
  }
  return null;
}
