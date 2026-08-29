"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MapPinned } from "lucide-react";
import type { DispatchRoute } from "../lib/dispatchSupport";
import { eyebrow, panel } from "../lib/dispatchSupport";
import ServiceSnapshotCard from "@/features/operations/components/ServiceSnapshotCard";
import ExpressReportOverlay from "@/features/operations/manifests/components/ExpressReportOverlay";
import ComplianceReportOverlay from "@/features/operations/components/ComplianceReportOverlay";
import OperationsWorkspaceToolbar from "@/features/operations/components/OperationsWorkspaceToolbar";
import RouteHealthOverlay, {
  type ManifestRouteHealthCard,
  type RouteHealthOverlayView,
} from "@/features/operations/manifests/components/RouteHealthOverlay";
import RouteHealthSignal from "@/features/operations/delivery-window/components/RouteHealthSignal";
import { ExpressProgressSignal } from "@/features/operations/express/ExpressProgressSignal";
import {
  computeFccRouteHealth,
  type FccRouteSignalRow,
} from "@/features/operations/delivery-window/lib/fccRouteHealth";
import { preferredManifestRouteKey } from "@/features/operations/manifests/routeEvidence";
import { fetchServiceJsonOnce } from "@/features/operations/delivery-window/serviceDataClient";
import {
  hasHistoricalFccEvidence,
  historicalRouteEvidenceLabel,
  historicalRouteSignal,
  historicalServiceSummary,
} from "@/features/operations/delivery-window/lib/historicalServicePresentation";
import {
  type DroPlanRow,
  hasManifestRouteEvidence,
  hasServiceActivity,
  routeEvidenceStatus,
  sourceCoverage,
} from "@/features/operations/delivery-window/lib/serviceRouteEvidence";

type DswCurrentRow = {
  batch_id: string;
  service_date: string;
  generated_at_text: string | null;
  terminal_identity: string | null;
  contract_filter: string | null;
  route_baseline_id: string | null;
  route_name: string | null;
  wa_number: string | null;
  driver_name: string | null;
  vehicle_text: string | null;
  vscan_packages: number;
  planned_delivery_stops: number;
  planned_pickup_stops: number;
  actual_delivery_stops: number;
  actual_delivery_packages: number;
  actual_pickup_stops: number;
  actual_pickup_packages: number;
  miles: number | null;
  ils_percent?: number | string | null;
  normalized_row_json?: Record<string, unknown> | null;
  route_match_method: string | null;
  authoritative_inventory_only?: boolean;
  matched_roster_member_id?: string | null;
  matched_roster_full_name?: string | null;
  matched_roster_dswid?: string | null;
};

type DswPayload = {
  source: "DSW";
  snapshot_kind: "IN_DAY" | "FINAL";
  inventory_source?: "DSW_IN_DAY" | "DSW_FINAL" | null;
  generated_at_text: string | null;
  terminal_identity: string | null;
  contract_filter: string | null;
  rows: DswCurrentRow[];
};

type FccPayload = {
  source: "FCC";
  snapshot_kind: "IN_DAY";
  batch_id: string | null;
  created_at: string | null;
  generated_at_text: string | null;
  report_date_text: string | null;
  rows: FccRouteSignalRow[];
};

type DroPayload = {
  source_frame: "AM" | "PM";
  fallback_used: boolean;
  rows: DroPlanRow[];
};

type DeliveryWindowSnapshotProps = {
  slug: string;
  serviceDate: string;
  dataMode: "live" | "historical";
  requestVersion: number;
  routes: DispatchRoute[];
  routeLabelForDisplay: (route: DispatchRoute) => string;
  onRefresh: () => void;
  onUploadReport: () => void;
  onActions: () => void;
  onAttendance: () => void;
};
type RouteHealthPayload = {
  routes: ManifestRouteHealthCard[];
  totals: Record<string, unknown> | null;
  freshness?: Record<string, unknown>;
  error?: string;
};

type SelectedManifestRouteHealth = {
  routeLabel: string;
  routeKey: string;
  health: ManifestRouteHealthCard | null;
  dsw: DswCurrentRow | null;
  initialView: RouteHealthOverlayView;
  droAm: DroPlanRow | null;
  droPm: DroPlanRow | null;
  fcc: FccRouteSignalRow | null;
  dispatchDriver: string | null;
};


function normalizeWaNumber(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  const trimmed = raw.replace(/^0+/, "");
  return trimmed || raw;
}

function normalizeKey(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^wa\s+/i, "")
    .replace(/[^a-z0-9]+/g, "");
}

function normalizedRouteName(value: string | null | undefined) {
  const raw = String(value ?? "").trim().toLowerCase();
  const peak = raw.includes("peak") ? "peak" : "";
  const match = raw.match(/bpv\s*0*(\d+)/i);
  if (!match) return normalizeKey(value);
  return `${peak}bpv${Number(match[1])}`;
}

function normalizeName(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function dswIdentityKey(value: string | null | undefined) {
  const normalized = String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z,\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return "";

  if (normalized.includes(",")) {
    const [lastRaw, restRaw = ""] = normalized.split(",");
    const last = lastRaw.trim();
    const first = restRaw.trim().split(" ")[0] ?? "";
    return last && first ? `${last}|${first}` : "";
  }

  const parts = normalized.split(" ").filter(Boolean);
  if (parts.length < 2) return "";
  const first = parts[0];
  const last = parts[parts.length - 1];
  return last && first ? `${last}|${first}` : "";
}

function routeKey(route: DispatchRoute) {
  return route.current_wa_num ?? route.route_name ?? route.route_key;
}

function routeSortToken(value: string | null | undefined) {
  const text = String(value ?? "");
  const number = text.match(/\d+/)?.[0];
  return number ? Number(number) : Number.MAX_SAFE_INTEGER;
}

function operationalRouteOrder(item: {
  route: DispatchRoute | null;
  row: DswCurrentRow | null;
}) {
  const routeName = item.route?.route_name ?? item.row?.route_name ?? "";
  const bpv = routeName.match(/\bbpv\s*0*(\d+)/i)?.[1];
  if (bpv) return Number(bpv);

  const wa = item.route?.current_wa_num ?? item.row?.wa_number ?? routeName;
  return 1000 + routeSortToken(wa);
}

function dswDisplayKey(row: DswCurrentRow, index: number) {
  return row.route_name || row.wa_number || `dsw-${index}`;
}

function dswRowIdentity(row: DswCurrentRow, index: number) {
  return [
    row.batch_id,
    row.route_baseline_id,
    row.wa_number,
    row.route_name,
    index,
  ]
    .filter(Boolean)
    .join(":");
}

function droIndex(rows: DroPlanRow[]) {
  const map = new Map<string, DroPlanRow>();

  for (const row of rows) {
    for (const key of [
      row.route_baseline_id,
      row.wa_number,
      row.route_name,
      normalizedRouteName(row.route_name),
    ]) {
      const normalized = normalizeKey(key);
      if (normalized) map.set(normalized, row);
    }
  }

  return map;
}

function findDroRow(
  index: Map<string, DroPlanRow>,
  route: DispatchRoute | null,
  dsw: DswCurrentRow | null,
  fallbackKey: string
) {
  for (const candidate of [
    route?.route_key,
    route?.current_wa_num,
    route?.route_name,
    dsw?.route_baseline_id,
    dsw?.wa_number,
    dsw?.route_name,
    fallbackKey,
  ]) {
    const direct = index.get(normalizeKey(candidate));
    if (direct) return direct;
    const named = index.get(normalizedRouteName(candidate));
    if (named) return named;
  }

  return null;
}

function isActiveDswRow(row: DswCurrentRow) {
  return (
    Number(row.vscan_packages ?? 0) > 0 ||
    Number(row.planned_delivery_stops ?? 0) > 0 ||
    Number(row.planned_pickup_stops ?? 0) > 0 ||
    Number(row.actual_delivery_stops ?? 0) > 0 ||
    Number(row.actual_delivery_packages ?? 0) > 0 ||
    Number(row.actual_pickup_stops ?? 0) > 0 ||
    Number(row.actual_pickup_packages ?? 0) > 0
  );
}

function dswActivityScore(row: DswCurrentRow) {
  return (
    Number(row.actual_delivery_packages ?? 0) * 1000 +
    Number(row.actual_delivery_stops ?? 0) * 100 +
    Number(row.actual_pickup_packages ?? 0) * 50 +
    Number(row.actual_pickup_stops ?? 0) * 25 +
    Number(row.vscan_packages ?? 0) +
    Number(row.planned_delivery_stops ?? 0) +
    Number(row.planned_pickup_stops ?? 0)
  );
}

function findContractIlsPercent(payload: any) {
  const rows = Array.isArray(payload?.rows)
    ? payload.rows
    : Array.isArray(payload?.summary_rows)
      ? payload.summary_rows
      : [];

  const contractRow =
    rows.find((row: any) => String(row?.summary_scope ?? "").toUpperCase() === "CONTRACT") ??
    rows.find((row: any) => String(row?.summary_label ?? "").toLowerCase().includes("contract")) ??
    null;

  const value =
    contractRow?.normalized_row_json?.ils_percent ??
    contractRow?.ils_percent ??
    payload?.contract?.ils_percent ??
    null;

  return formatPercent(value);
}

function formatPercent(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;

  const raw = typeof value === "number" ? value : Number(String(value).replace("%", "").trim());
  if (!Number.isFinite(raw)) return null;

  const pctValue = raw <= 1 ? raw * 100 : raw;
  return `${pctValue.toFixed(1).replace(/\.0$/, "")}%`;
}

function ilsRouteLabel(value: number | string | null | undefined) {
  const formatted = formatPercent(value);
  if (!formatted) return null;

  const raw = typeof value === "number" ? value : Number(String(value).replace("%", "").trim());
  if (!Number.isFinite(raw)) return null;

  const pctValue = raw <= 1 ? raw * 100 : raw;
  return {
    label: `ILS ${formatted}`,
    belowTarget: pctValue < 99.5,
  };
}


function pct(actual: number, planned: number) {
  if (!planned) return 0;
  return Math.min(100, Math.round((actual / planned) * 100));
}

function completionPct(row: DswCurrentRow | null | undefined) {
  if (!row) return 0;

  const plannedStops = Number(row.planned_delivery_stops ?? 0);
  const actualStops = Number(row.actual_delivery_stops ?? 0);
  const plannedPackages = Number(row.vscan_packages ?? 0);
  const actualPackages = Number(row.actual_delivery_packages ?? 0);

  if (plannedStops > 0) return pct(actualStops, plannedStops);
  if (plannedPackages > 0) return pct(actualPackages, plannedPackages);
  return 0;
}

function isOnRoadRow(item: { row: DswCurrentRow | null; signal: { key: string } }) {
  if (!item.row) return false;
  if (item.signal.key !== "logged_in" && item.signal.key !== "driver_mismatch" && item.signal.key !== "logged_in_unassigned") {
    return false;
  }

  const plannedPickups = Number(item.row.planned_pickup_stops ?? 0);
  const actualPickups = Number(item.row.actual_pickup_stops ?? 0);

  if (plannedPickups > actualPickups) return true;

  // Until we carry a true logout/closed signal, logged-in + DSW activity means still on road.
  return true;
}

function driverSignal(
  rowDriver: string | null | undefined,
  dispatchDriver: string | null | undefined,
  matchedRosterName: string | null | undefined,
  completion: number
) {
  const dsw = String(rowDriver ?? "").trim();
  const dispatch = String(dispatchDriver ?? "").trim();
  const matchedName = String(matchedRosterName ?? "").trim();

  if (!dispatch && !dsw) {
    return { label: "No Dispatch Driver", tone: "#64748b", icon: "⚪", key: "no_dispatch_driver" };
  }

  if (dispatch && !dsw) {
    return { label: "Awaiting Login", tone: "#92400e", icon: "🟡", key: "awaiting_login" };
  }

  if (!dispatch && dsw) {
    return { label: "Logged In / Unassigned", tone: "#7c2d12", icon: "🟠", key: "logged_in_unassigned" };
  }

  if (matchedName && normalizeName(dispatch) === normalizeName(matchedName)) {
    return { label: "Logged In", tone: "#166534", icon: "🟢", key: "logged_in" };
  }

  if (normalizeName(dispatch) === normalizeName(dsw)) {
    return { label: "Logged In", tone: "#166534", icon: "🟢", key: "logged_in" };
  }

  return { label: "Driver Mismatch", tone: "#991b1b", icon: "🟠", key: "driver_mismatch" };
}

export function DeliveryWindowSnapshot(props: DeliveryWindowSnapshotProps) {
  const [expressReportOpen, setExpressReportOpen] = useState(false);
  const [complianceReportOpen, setComplianceReportOpen] = useState(false);
  const [routeHealthPayload, setRouteHealthPayload] = useState<RouteHealthPayload | null>(null);
  const [selectedRouteHealth, setSelectedRouteHealth] =
    useState<SelectedManifestRouteHealth | null>(null);

  const {
    slug,
    serviceDate,
    dataMode,
    requestVersion,
    routes,
    routeLabelForDisplay,
    onRefresh,
    onUploadReport,
    onActions,
    onAttendance,
  } = props;
  const [payload, setPayload] = useState<DswPayload | null>(null);
  const [droAmPayload, setDroAmPayload] = useState<DroPayload | null>(null);
  const [droPmPayload, setDroPmPayload] = useState<DroPayload | null>(null);
  const [fccPayload, setFccPayload] = useState<FccPayload | null>(null);
  const [serviceSnapshotPayload, setServiceSnapshotPayload] = useState<any>(null);
  const [routeView, setRouteView] = useState<"all" | "exceptions" | "on_road" | "returned">("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadSnapshot() {
      try {
        setLoading(true);
        setError(null);

        const result = await fetchServiceJsonOnce(
          `/api/company/${slug}/operations/reports/dsw-current?date=${serviceDate}`,
          requestVersion
        );
        const data = result.data;

        if (!active) return;

        if (!result.ok) {
          setPayload(null);
          setError(data?.error ?? "Failed to load DSW snapshot.");
          return;
        }

        setPayload(data);
      } catch (err) {
        if (!active) return;
        setPayload(null);
        setError(err instanceof Error ? err.message : "Failed to load DSW snapshot.");
      } finally {
        if (active) setLoading(false);
      }
    }

    loadSnapshot();

    return () => {
      active = false;
    };
  }, [requestVersion, serviceDate, slug]);

  useEffect(() => {
    let active = true;

    async function loadDroPlans() {
      try {
        const [amResult, pmResult] = await Promise.all([
          fetchServiceJsonOnce(
            `/api/company/${slug}/operations/reports/dro-plan?date=${serviceDate}&frame=AM`,
            requestVersion
          ),
          fetchServiceJsonOnce(
            `/api/company/${slug}/operations/reports/dro-plan?date=${serviceDate}&frame=PM`,
            requestVersion
          ),
        ]);
        if (!active) return;

        setDroAmPayload(amResult.ok ? (amResult.data as DroPayload) : null);
        setDroPmPayload(pmResult.ok ? (pmResult.data as DroPayload) : null);
      } catch {
        if (!active) return;
        setDroAmPayload(null);
        setDroPmPayload(null);
      }
    }

    if (slug && serviceDate) void loadDroPlans();

    return () => {
      active = false;
    };
  }, [requestVersion, serviceDate, slug]);

  useEffect(() => {
    let active = true;

    async function loadFccSnapshot() {
      try {
        const result = await fetchServiceJsonOnce(
          `/api/company/${slug}/operations/reports/fcc-current?date=${serviceDate}`,
          requestVersion
        );
        const data = result.data;
        if (!active) return;

        setFccPayload(result.ok ? data : null);
      } catch {
        if (active) setFccPayload(null);
      }
    }

    if (slug && serviceDate) void loadFccSnapshot();

    return () => {
      active = false;
    };
  }, [requestVersion, serviceDate, slug]);

  useEffect(() => {
    let active = true;

    async function loadServiceSnapshot() {
      try {
        const result = await fetchServiceJsonOnce(
          `/api/company/${slug}/operations/reports/dsw-service-snapshot?date=${serviceDate}`,
          requestVersion
        );
        const data = result.data;
        if (!active) return;

        setServiceSnapshotPayload(result.ok ? data : null);
      } catch {
        if (active) setServiceSnapshotPayload(null);
      }
    }

    if (slug && serviceDate) void loadServiceSnapshot();

    return () => {
      active = false;
    };
  }, [requestVersion, serviceDate, slug]);
  useEffect(() => {
    let active = true;

    async function loadRouteHealth() {
      try {
        const result = await fetchServiceJsonOnce(
          `/api/company/${slug}/operations/route-health?serviceDate=${encodeURIComponent(serviceDate)}`,
          requestVersion
        );
        const data = result.data as RouteHealthPayload | null;
        if (!active) return;

        setRouteHealthPayload(result.ok ? data : null);
      } catch {
        if (active) setRouteHealthPayload(null);
      }
    }

    if (slug && serviceDate) void loadRouteHealth();

    return () => {
      active = false;
    };
  }, [requestVersion, serviceDate, slug]);


  const dswIndex = useMemo(() => {
    const map = new Map<string, DswCurrentRow>();

    function setBest(key: string | null | undefined, row: DswCurrentRow) {
      const normalized = normalizeKey(key);
      if (!normalized) return;

      const existing = map.get(normalized);
      if (!existing || dswActivityScore(row) > dswActivityScore(existing)) {
        map.set(normalized, row);
      }
    }

    for (const row of payload?.rows ?? []) {
      setBest(row.route_baseline_id, row);
      setBest(row.wa_number, row);
      setBest(row.route_name, row);
      setBest(normalizedRouteName(row.route_name), row);
    }

    return map;
  }, [payload?.rows]);

  const droAmIndex = useMemo(
    () => droIndex(droAmPayload?.rows ?? []),
    [droAmPayload?.rows]
  );
  const droPmIndex = useMemo(
    () => droIndex(droPmPayload?.rows ?? []),
    [droPmPayload?.rows]
  );

  const fccIndex = useMemo(() => {
    const map = new Map<string, FccRouteSignalRow>();

    for (const row of fccPayload?.rows ?? []) {
      const key = normalizeWaNumber(row.wa_number_normalized ?? row.wa_number);
      if (key) map.set(key, row);
    }

    return map;
  }, [fccPayload?.rows]);
  const manifestRouteHealthIndex = useMemo(() => {
    const map = new Map<string, ManifestRouteHealthCard>();

    function setKey(value: string | null | undefined, health: ManifestRouteHealthCard) {
      const normalized = normalizeKey(value);
      if (normalized) map.set(normalized, health);

      const normalizedName = normalizedRouteName(value);
      if (normalizedName) map.set(normalizedName, health);
    }

    for (const health of routeHealthPayload?.routes ?? []) {
      setKey(health.route_key, health);
      setKey(health.route_label, health);
    }

    return map;
  }, [routeHealthPayload?.routes]);

  const manifestHealthForItem = useCallback((item: {
    route: DispatchRoute | null;
    row: DswCurrentRow | null;
    key: string;
  }) => {
    const candidates = [
      item.route?.route_key,
      item.route?.current_wa_num,
      item.route?.route_name,
      item.route ? routeKey(item.route) : null,
      item.row?.route_baseline_id,
      item.row?.wa_number,
      item.row?.route_name,
      item.key,
    ];

    for (const candidate of candidates) {
      if (!candidate) continue;

      const normalized = normalizeKey(candidate);
      const normalizedName = normalizedRouteName(candidate);

      const direct = normalized ? manifestRouteHealthIndex.get(normalized) : null;
      if (direct) return direct;

      const nameMatch = normalizedName ? manifestRouteHealthIndex.get(normalizedName) : null;
      if (nameMatch) return nameMatch;
    }

    return null;
  }, [manifestRouteHealthIndex]);


  const routeRows = useMemo(() => {
    const matchedKeys = new Set<string>();

    function markMatched(row: DswCurrentRow | null) {
      if (!row) return;
      for (const key of [row.route_baseline_id, row.wa_number, row.route_name]) {
        const normalized = normalizeKey(key);
        if (normalized) matchedKeys.add(normalized);
      }
      const routeNameKey = normalizedRouteName(row.route_name);
      if (routeNameKey) matchedKeys.add(routeNameKey);
    }

    function isMatched(row: DswCurrentRow) {
      return (
        [row.route_baseline_id, row.wa_number, row.route_name].some((key) =>
          matchedKeys.has(normalizeKey(key))
        ) || matchedKeys.has(normalizedRouteName(row.route_name))
      );
    }

    const configuredRows = routes.map((route, index) => {
      const row =
        dswIndex.get(normalizedRouteName(route.route_name)) ??
        dswIndex.get(normalizedRouteName(route.route_key)) ??
        dswIndex.get(normalizeKey(route.current_wa_num)) ??
        dswIndex.get(normalizeKey(route.route_name)) ??
        dswIndex.get(normalizeKey(route.route_key)) ??
        dswIndex.get(normalizeKey(routeKey(route))) ??
        null;

      markMatched(row);

      const completion = completionPct(row);
      const fccRow = fccIndex.get(normalizeWaNumber(route.current_wa_num ?? route.route_key)) ?? null;
      const fccHealth = computeFccRouteHealth(fccRow);
      const droAm = findDroRow(droAmIndex, route, row, route.route_key);
      const droPm = findDroRow(droPmIndex, route, row, route.route_key);

      const roadHours = row?.normalized_row_json?.on_road_hours ?? null;
      const dutyHours = row?.normalized_row_json?.on_duty_hours ?? null;
      const miles = row?.normalized_row_json?.miles ?? null;

      const returned =
        miles !== null &&
        roadHours !== null &&
        dutyHours !== null;

      const routeManifestHealth = manifestHealthForItem({
        route,
        row,
        key: route.route_key,
      });
      const hasManifest = hasManifestRouteEvidence(routeManifestHealth);
      const signal = dataMode === "historical"
        ? historicalRouteSignal({
            hasDsw: Boolean(row),
            hasFcc: hasHistoricalFccEvidence(fccRow),
            hasManifest,
            hasDispatchAssignment: Boolean(route.driver),
          })
        : returned
          ? {
              label: "Returned",
              tone: "#166534",
              icon: "🏁",
              key: "returned",
            }
          : driverSignal(
              row?.driver_name,
              route.driver?.full_name,
              row?.matched_roster_full_name,
              completion
            );
      const evidencePresence = {
        dsw: Boolean(row),
        dro: Boolean(droAm || droPm),
        manifest: hasManifest,
        fcc: Boolean(fccRow),
        dispatch: Boolean(route.driver),
        identityConflict: signal.key === "driver_mismatch",
      };

      return {
        key: route.route_key || route.current_wa_num || route.route_name || `route-${index}`,
        route,
        row,
        completion,
        signal,
        fccRow,
        fccHealth,
        droAm,
        droPm,
        routeManifestHealth,
        evidencePresence,
        evidence: routeEvidenceStatus(evidencePresence),
        returned,
        roadHours,
        dutyHours,
        miles,
        sortOrder: index,
        configOrder: index,
        isConfigRoute: true,
      };
    });

    const extraActiveRows = (payload?.rows ?? [])
      .filter(isActiveDswRow)
      .filter((row) => !isMatched(row))
      .map((row, index) => {
        const completion = completionPct(row);
        const fccRow = fccIndex.get(normalizeWaNumber(row.wa_number ?? row.route_name)) ?? null;
        const fccHealth = computeFccRouteHealth(fccRow);
        const droAm = findDroRow(droAmIndex, null, row, row.wa_number ?? row.route_name ?? "");
        const droPm = findDroRow(droPmIndex, null, row, row.wa_number ?? row.route_name ?? "");

        const roadHours = row?.normalized_row_json?.on_road_hours ?? null;
        const dutyHours = row?.normalized_row_json?.on_duty_hours ?? null;
        const miles = row?.normalized_row_json?.miles ?? null;

        const returned = Boolean(miles && roadHours && dutyHours);

        const signal = dataMode === "historical"
          ? historicalRouteSignal({
              hasDsw: true,
              hasFcc: hasHistoricalFccEvidence(fccRow),
              hasManifest: false,
              hasDispatchAssignment: false,
            })
          : driverSignal(
              row.driver_name,
              null,
              row.matched_roster_full_name,
              completion
            );
        const routeManifestHealth = manifestHealthForItem({
          route: null,
          row,
          key: row.wa_number ?? row.route_name ?? "",
        });
        const evidencePresence = {
          dsw: true,
          dro: Boolean(droAm || droPm),
          manifest: hasManifestRouteEvidence(routeManifestHealth),
          fcc: Boolean(fccRow),
          dispatch: false,
          identityConflict: signal.key === "driver_mismatch",
        };

        return {
          key: `dsw-active-${dswRowIdentity(row, index) || index}`,
          route: null,
          row,
          completion,
          fccRow,
          fccHealth,
          droAm,
          droPm,
          routeManifestHealth,
          evidencePresence,
          evidence: routeEvidenceStatus(evidencePresence),
          returned,
          roadHours,
          dutyHours,
          miles,
          signal,
          sortOrder: routes.length + routeSortToken(row.route_name ?? row.wa_number),
          configOrder: routes.length + index,
          isConfigRoute: false,
        };
      });

    return [...configuredRows, ...extraActiveRows].sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.configOrder - b.configOrder;
    });
  }, [
    dataMode,
    droAmIndex,
    droPmIndex,
    dswIndex,
    fccIndex,
    manifestHealthForItem,
    payload?.rows,
    routes,
  ]);

  const matchedDswIds = useMemo(() => {
    const ids = new Set<DswCurrentRow>();

    for (const item of routeRows) {
      if (item.row) ids.add(item.row);
    }

    return ids;
  }, [routeRows]);

  const dswRows = payload?.rows ?? [];

  const activeDswRows = dswRows.filter(isActiveDswRow);
  const hiddenEmptyDswRows = dswRows.filter((row) => !isActiveDswRow(row));
  const unplannedActiveRows = activeDswRows.filter((row) => !matchedDswIds.has(row));

  const serviceRouteRows = useMemo(
    () =>
      routeRows
        .filter((item) =>
          hasServiceActivity({
            dsw: item.evidencePresence.dsw,
            dro: item.evidencePresence.dro,
            manifest: item.evidencePresence.manifest,
            fccActivity: hasHistoricalFccEvidence(item.fccRow),
          })
        )
        .sort((a, b) => {
          const authorityA = a.evidencePresence.dsw
            ? 0
            : a.evidencePresence.dro
              ? 1
              : a.evidencePresence.manifest
                ? 2
                : 3;
          const authorityB = b.evidencePresence.dsw
            ? 0
            : b.evidencePresence.dro
              ? 1
              : b.evidencePresence.manifest
                ? 2
                : 3;
          if (authorityA !== authorityB) return authorityA - authorityB;

          const order = operationalRouteOrder(a) - operationalRouteOrder(b);
          if (order !== 0) return order;
          return a.configOrder - b.configOrder;
        }),
    [routeRows]
  );

  const visibleRouteRows = useMemo(() => {
    switch (routeView) {
      case "exceptions":
        return serviceRouteRows.filter((row) => row.evidence.key !== "complete");

      case "on_road":
        return serviceRouteRows.filter((row) => !row.returned);

      case "returned":
        return serviceRouteRows.filter((row) => row.returned);

      default:
        return serviceRouteRows;
    }
  }, [routeView, serviceRouteRows]);

  const coverage = useMemo(
    () => sourceCoverage(serviceRouteRows.map((route) => route.evidencePresence)),
    [serviceRouteRows]
  );
  const completeEvidenceRouteCount = serviceRouteRows.filter(
    (route) => route.evidence.key === "complete"
  ).length;
  const evidenceExceptionCount = serviceRouteRows.length - completeEvidenceRouteCount;

  const driverStats = serviceRouteRows.reduce(
    (acc, item) => {
      if (item.signal.key === "awaiting_login") acc.awaitingLogin += 1;
      if (item.signal.key === "logged_in") acc.loggedIn += 1;
      if (item.signal.key === "driver_mismatch") acc.mismatch += 1;
      if (item.signal.key === "no_dispatch_driver") acc.noDriver += 1;
      if (item.signal.key === "complete") acc.complete += 1;
      return acc;
    },
    {
      awaitingLogin: 0,
      loggedIn: 0,
      mismatch: 0,
      noDriver: 0,
      complete: 0,
    }
  );

  const fleetCompletion = useMemo(() => {
    const plannedStops = serviceRouteRows.reduce(
      (sum, item) => sum + Number(item.row?.planned_delivery_stops ?? 0),
      0
    );
    const actualStops = serviceRouteRows.reduce(
      (sum, item) => sum + Number(item.row?.actual_delivery_stops ?? 0),
      0
    );

    if (plannedStops > 0) return pct(actualStops, plannedStops);

    const plannedPackages = serviceRouteRows.reduce(
      (sum, item) => sum + Number(item.row?.vscan_packages ?? 0),
      0
    );
    const actualPackages = serviceRouteRows.reduce(
      (sum, item) => sum + Number(item.row?.actual_delivery_packages ?? 0),
      0
    );

    return pct(actualPackages, plannedPackages);
  }, [serviceRouteRows]);


  const executionTotals = useMemo(() => {
    return serviceRouteRows.reduce(
      (acc, item) => {
        const row = item.row;
        if (!row || !isActiveDswRow(row)) return acc;

        acc.activeRoutes += 1;
        acc.plannedPackages += Number(row.vscan_packages ?? 0);
        acc.actualPackages += Number(row.actual_delivery_packages ?? 0);
        acc.plannedStops += Number(row.planned_delivery_stops ?? 0);
        acc.actualStops += Number(row.actual_delivery_stops ?? 0);
        acc.plannedPickupStops += Number(row.planned_pickup_stops ?? 0);
        acc.actualPickupStops += Number(row.actual_pickup_stops ?? 0);

        const ilsRaw = row.ils_percent;
        const ilsNumber =
          typeof ilsRaw === "number"
            ? ilsRaw
            : ilsRaw == null || ilsRaw === ""
              ? null
              : Number(String(ilsRaw).replace("%", "").trim());

        if (ilsNumber !== null && Number.isFinite(ilsNumber)) {
          const normalizedIls = ilsNumber <= 1 ? ilsNumber * 100 : ilsNumber;
          const weight = Number(row.vscan_packages ?? 0) || 1;
          acc.ilsWeightedTotal += normalizedIls * weight;
          acc.ilsWeight += weight;
        }

        if (item.signal.key === "logged_in" || item.signal.key === "complete") {
          acc.loggedIn += 1;
        }

        return acc;
      },
      {
        activeRoutes: 0,
        loggedIn: 0,
        plannedPackages: 0,
        actualPackages: 0,
        plannedStops: 0,
        actualStops: 0,
        plannedPickupStops: 0,
        actualPickupStops: 0,
        ilsWeightedTotal: 0,
        ilsWeight: 0,
      }
    );
  }, [serviceRouteRows]);

  const historicalSummary = useMemo(
    () => historicalServiceSummary(
      serviceSnapshotPayload,
      serviceRouteRows.length
    ),
    [serviceRouteRows.length, serviceSnapshotPayload]
  );
  const companyIlsPercent = findContractIlsPercent(serviceSnapshotPayload) ?? "—";

  const summaryItems = dataMode === "historical"
    ? [
        ["Routes reported", historicalSummary.reportedRoutes.toLocaleString()],
        ["📍 Del Stops", `${historicalSummary.actualStops.toLocaleString()} / ${historicalSummary.plannedStops.toLocaleString()}`],
        ["📦 Del Packages", `${historicalSummary.actualPackages.toLocaleString()} / ${historicalSummary.plannedPackages.toLocaleString()}`],
        ["🛻 Pickups", `${historicalSummary.actualPickupStops.toLocaleString()} / ${historicalSummary.plannedPickupStops.toLocaleString()}`],
        ["ILS %", companyIlsPercent],
        ["Completion", `${historicalSummary.completion}%`],
      ]
    : [
        ["Routes / Logged In", `${executionTotals.activeRoutes} / ${executionTotals.loggedIn}`],
        ["📍 Del Stops", `${executionTotals.actualStops.toLocaleString()} / ${executionTotals.plannedStops.toLocaleString()}`],
        ["📦 Del Packages", `${executionTotals.actualPackages.toLocaleString()} / ${executionTotals.plannedPackages.toLocaleString()}`],
        ["🛻 Pickups", `${executionTotals.actualPickupStops.toLocaleString()} / ${executionTotals.plannedPickupStops.toLocaleString()}`],
        ["ILS %", companyIlsPercent],
        ["Completion", `${fleetCompletion}%`],
      ];

  const expressPackageTotal = Number(
    routeHealthPayload?.totals?.express_package_count ?? 0
  );
  const completeExpressPackageTotal = Number(
    routeHealthPayload?.totals?.complete_express_package_count ?? 0
  );
  const attemptedExpressPackageTotal = Number(
    routeHealthPayload?.totals?.attempted_express_package_count ?? 0
  );
  const openExpressPackageTotal = Number(
    routeHealthPayload?.totals?.open_express_package_count ?? 0
  );

  return (
    <>
      <OperationsWorkspaceToolbar
        slug={slug}
        onActions={onActions}
        onComplianceReport={() => setComplianceReportOpen(true)}
        onExpressReport={() => setExpressReportOpen(true)}
        onAttendance={onAttendance}
        onRefresh={onRefresh}
        onUpload={onUploadReport}
      />

      <section className="delivery-window-grid">
      <section className="delivery-window__main" style={{ ...panel, padding: 14, display: "grid", gap: 10 }}>
        <div className="delivery-window__header" style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <p style={eyebrow}>Service</p>
            <h2 style={{ margin: 0, fontSize: 18 }}>Service Line Up</h2>
            <small style={{ color: "#64748b", fontWeight: 800 }}>
              {dataMode === "live"
                ? "Today · selected-day Dispatch, DRO, DSW, manifest, and FCC evidence"
                : `${serviceDate} · selected-day Dispatch, DRO, DSW, manifest, and FCC evidence`}
            </small>
          </div>
        </div>

        <div
          className="delivery-window__summary-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
            gap: 8,
            borderTop: "1px solid #e5ecf6",
            paddingTop: 10,
          }}
        >
          {summaryItems.map(([label, value]) => (
            <div
              key={label}
              style={{
                border: "1px solid #e5ecf6",
                borderRadius: 14,
                padding: "8px 10px",
                background: "#f8fbff",
                display: "grid",
                gap: 2,
              }}
            >
              <span
                style={{
                  color: "#64748b",
                  fontSize: 10,
                  fontWeight: 900,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                {label}
              </span>
              <strong>{value}</strong>
            </div>
          ))}
          <ExpressProgressSignal
            progress={{
              total: expressPackageTotal,
              complete: completeExpressPackageTotal,
              attempted: attemptedExpressPackageTotal,
              open: openExpressPackageTotal,
            }}
            dataHealth={{
              trackingIdentityMissing: Number(routeHealthPayload?.totals?.tracking_identity_missing_count ?? 0),
              stopLinkMissing: Number(routeHealthPayload?.totals?.stop_link_missing_count ?? 0),
              stopLinkAmbiguous: Number(routeHealthPayload?.totals?.stop_link_ambiguous_count ?? 0),
              referenceMatchAvailable: routeHealthPayload?.totals?.reference_match_available !== false,
            }}
            compact
          />
        </div>

        <section
          aria-label="Selected-day source coverage"
          style={{
            border: "1px solid #dbe4ef",
            borderRadius: 14,
            background: "#fff",
            padding: 10,
            display: "grid",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <span style={{ display: "grid", gap: 2 }}>
              <strong style={{ fontSize: 13 }}>Route evidence coverage</strong>
              <small style={{ color: "#64748b", fontWeight: 800 }}>
                Every source is resolved against the {serviceRouteRows.length} routes with service activity for this date.
              </small>
            </span>
            <span
              style={{
                alignSelf: "start",
                borderRadius: 999,
                background: evidenceExceptionCount ? "#fffbeb" : "#ecfdf5",
                color: evidenceExceptionCount ? "#92400e" : "#166534",
                padding: "6px 9px",
                fontSize: 10,
                fontWeight: 950,
              }}
            >
              {completeEvidenceRouteCount} complete · {evidenceExceptionCount} inspect
            </span>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
              gap: 6,
            }}
          >
            {coverage.map((source) => {
              const complete = source.total > 0 && source.represented === source.total;
              return (
                <div
                  key={source.key}
                  style={{
                    border: `1px solid ${complete ? "#bbf7d0" : "#fde68a"}`,
                    borderRadius: 11,
                    background: complete ? "#f0fdf4" : "#fffbeb",
                    padding: "8px 9px",
                    display: "grid",
                    gap: 2,
                  }}
                >
                  <small style={{ color: "#64748b", fontSize: 9, fontWeight: 950 }}>
                    {source.label}
                  </small>
                  <strong style={{ fontSize: 13 }}>
                    {source.represented} / {source.total} routes
                  </strong>
                </div>
              );
            })}
          </div>
        </section>

        {error ? (
          <div style={{ border: "1px solid #fecaca", background: "#fef2f2", color: "#991b1b", borderRadius: 12, padding: 10, fontSize: 13, fontWeight: 800 }}>
            {error}
          </div>
        ) : null}

        {loading ? (
          <div style={{ padding: 12, color: "#64748b", fontWeight: 800 }}>Loading DSW snapshot...</div>
        ) : null}

        <div className="delivery-window__filters" style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
          {[
            ["all", "All Routes"],
            ["exceptions", `Inspect ${evidenceExceptionCount}`],
            ["on_road", "On Road"],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setRouteView(key as "all" | "exceptions" | "on_road")}
              style={{
                border: routeView === key ? "1px solid #2563eb" : "1px solid #d7e1ee",
                background: routeView === key ? "#eff6ff" : "#fff",
                color: routeView === key ? "#1d4ed8" : "#334155",
                borderRadius: 999,
                padding: "7px 10px",
                fontSize: 12,
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="delivery-window__route-list" style={{ display: "grid", gap: 8 }}>
          {visibleRouteRows.map((item) => {
            const {
              route,
              row,
              signal,
              completion,
              fccRow,
              fccHealth,
              droAm,
              droPm,
              routeManifestHealth,
              evidence,
            } = item;
            const selectedRouteLabel = route
              ? routeLabelForDisplay(item.route)
              : dswDisplayKey(row!, item.sortOrder);
            const selectedRouteKey = preferredManifestRouteKey(
              routeManifestHealth?.route_key,
              item.route?.current_wa_num,
              item.row?.wa_number,
              item.route?.route_key,
              item.row?.route_baseline_id,
              item.row?.route_name,
              item.key
            );
            const openRouteView = (initialView: RouteHealthOverlayView) =>
              setSelectedRouteHealth({
                routeLabel: selectedRouteLabel,
                routeKey: selectedRouteKey,
                health: routeManifestHealth,
                dsw: row ?? null,
                initialView,
                droAm,
                droPm,
                fcc: fccRow,
                dispatchDriver: route?.driver?.full_name ?? null,
              });

            return (
              <div
                key={item.key}
                className="delivery-window__route-row"
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(220px, 0.9fr) minmax(520px, 2.1fr) minmax(176px, 0.55fr)",
                  gap: 12,
                  alignItems: "center",
                  padding: "10px 12px",
                  borderRadius: 14,
                  border: "1px solid #e6edf5",
                  borderLeft: item.returned
                    ? "4px solid #22c55e"
                    : "1px solid #e6edf5",
                  background: item.returned
                    ? "#f8fffa"
                    : "#fff",
                }}
              >
                <div className="delivery-window__route-identity" style={{ minWidth: 0 }}>
                  <strong style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.route ? routeLabelForDisplay(item.route) : dswDisplayKey(row!, item.sortOrder)}
                  </strong>
                  <span style={{ display: "block", color: "#64748b", fontSize: 12, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.route?.driver?.full_name || row?.driver_name || "No driver"}
                    {row?.vehicle_text ? ` · Veh ${row.vehicle_text}` : ""}
                  </span>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      marginTop: 4,
                      color: signal.tone,
                      fontSize: 11,
                      fontWeight: 900,
                    }}
                  >
                    {signal.icon} {signal.label}
                    {ilsRouteLabel(row?.ils_percent) ? (
                      <span
                        style={{
                          marginLeft: 6,
                          color: ilsRouteLabel(row?.ils_percent)?.belowTarget ? "#991b1b" : signal.tone,
                        }}
                      >
                        · {ilsRouteLabel(row?.ils_percent)?.label}
                      </span>
                    ) : null}
                  </span>
                  <span
                    style={{
                      display: "inline-flex",
                      marginTop: 5,
                      borderRadius: 999,
                      background: evidence.background,
                      color: evidence.tone,
                      padding: "4px 7px",
                      fontSize: 9,
                      fontWeight: 950,
                    }}
                  >
                    {evidence.label}
                  </span>
                </div>

                <div className="delivery-window__route-progress" style={{ display: "grid", gap: 6 }}>
                  <RouteSourceFacts
                    dsw={row}
                    droAm={droAm}
                    droPm={droPm}
                    manifest={routeManifestHealth}
                    fcc={fccRow}
                  />
                </div>

                <div
                  className="delivery-window__route-health"
                  style={{
                    justifySelf: "end",
                    width: "100%",
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <RouteHealthSignal
                    health={fccHealth}
                    label="Evidence"
                    title={`${fccHealth.tooltip} · Open route health`}
                    onClick={() => openRouteView("detail")}
                  />
                  <button
                    type="button"
                    aria-label={`Open route map for ${selectedRouteLabel}`}
                    title={`Open route map for ${selectedRouteLabel}`}
                    onClick={() => openRouteView("map")}
                    style={{
                      width: "100%",
                      height: 30,
                      display: "inline-flex",
                      placeItems: "center",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 5,
                      border: "1px solid #d7e1ee",
                      borderRadius: 10,
                      background: "#fff",
                      color: routeManifestHealth ? "#2563eb" : "#64748b",
                      boxShadow: "0 3px 8px rgba(15, 23, 42, 0.08)",
                      cursor: "pointer",
                    }}
                  >
                    <MapPinned size={17} aria-hidden="true" />
                    <span style={{ fontSize: 10, fontWeight: 900 }}>Map</span>
                  </button>
                  <div
                    style={{
                      gridColumn: "1 / -1",
                      textAlign: "center",
                      borderRadius: 10,
                      padding: "5px 8px",
                      border: "1px solid #e6edf5",
                      background: completion >= 100 ? "#ecfdf5" : "#f8fafc",
                      color: completion >= 100 ? "#166534" : "#0f172a",
                      fontWeight: 950,
                    }}
                  >
                    {dataMode === "historical" && !row
                      ? historicalRouteEvidenceLabel({
                          hasDsw: false,
                          hasFcc: hasHistoricalFccEvidence(fccRow),
                          hasManifest: Boolean(routeManifestHealth),
                          hasDispatchAssignment: Boolean(route?.driver),
                        })
                      : `${completion}%`}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

      </section>

      <ExpressReportOverlay
        open={expressReportOpen}
        slug={slug}
        serviceDate={serviceDate}
        surfaceLabel="Service"
        onClose={() => setExpressReportOpen(false)}
      />
      <ComplianceReportOverlay open={complianceReportOpen} slug={slug} onClose={() => setComplianceReportOpen(false)} />

      <RouteHealthOverlay
        open={Boolean(selectedRouteHealth)}
        slug={slug}
        serviceDate={serviceDate}
        routeLabel={selectedRouteHealth?.routeLabel ?? "Route"}
        routeKey={selectedRouteHealth?.routeKey ?? ""}
        health={selectedRouteHealth?.health ?? null}
        dsw={selectedRouteHealth?.dsw ?? null}
        initialView={selectedRouteHealth?.initialView ?? "detail"}
        droAm={selectedRouteHealth?.droAm ?? null}
        droPm={selectedRouteHealth?.droPm ?? null}
        fcc={selectedRouteHealth?.fcc ?? null}
        dispatchDriver={selectedRouteHealth?.dispatchDriver ?? null}
        onClose={() => setSelectedRouteHealth(null)}
      />

      <aside className="delivery-window__aside" style={{ display: "grid", gap: 12 }}>
        <ServiceSnapshotCard slug={slug} serviceDate={serviceDate} />
      </aside>
      </section>
    </>
  );
}

function routePlanFact(am: DroPlanRow | null, pm: DroPlanRow | null) {
  if (!am && !pm) return "No route plan";
  if (am && pm && Number(am.stops ?? 0) !== Number(pm.stops ?? 0)) {
    return `AM ${Number(am.stops ?? 0)} → PM ${Number(pm.stops ?? 0)} stops`;
  }

  const plan = am ?? pm;
  const frame = am ? "AM" : "PM";
  const miles = Number(plan?.miles ?? 0);
  return [
    `${frame} · ${Number(plan?.stops ?? 0)} stops`,
    `${Number(plan?.packages ?? 0)} pkg`,
    miles > 0 ? `${miles.toFixed(1).replace(/\.0$/, "")} mi` : null,
  ].filter(Boolean).join(" · ");
}

function RouteSourceFacts({
  dsw,
  droAm,
  droPm,
  manifest,
  fcc,
}: {
  dsw: DswCurrentRow | null;
  droAm: DroPlanRow | null;
  droPm: DroPlanRow | null;
  manifest: ManifestRouteHealthCard | null;
  fcc: FccRouteSignalRow | null;
}) {
  const manifestPresent = hasManifestRouteEvidence(manifest);
  const dswPackageFact = dsw
    ? !dsw.authoritative_inventory_only && Number(dsw.vscan_packages ?? 0) > 0
      ? `${Number(dsw.actual_delivery_packages ?? 0)}/${Number(dsw.vscan_packages ?? 0)} pkg`
      : `${Number(dsw.actual_delivery_packages ?? 0)} delivered pkg`
    : null;
  const express = manifest?.express;
  const facts = [
    {
      label: "DRO",
      present: Boolean(droAm || droPm),
      value: routePlanFact(droAm, droPm),
    },
    {
      label: "DSW",
      present: Boolean(dsw),
      value: dsw
        ? `${Number(dsw.actual_delivery_stops ?? 0)}/${Number(dsw.planned_delivery_stops ?? 0)} stops · ${dswPackageFact}`
        : "No execution row",
    },
    {
      label: "Manifest",
      present: manifestPresent,
      value: manifestPresent
        ? `${Number(manifest?.delivery.stop_count ?? 0)} stops · ${Number(manifest?.delivery.package_count ?? 0)} pkg · ${Number(manifest?.pickup.stop_count ?? 0)} PU`
        : "No manifest rows",
    },
    {
      label: "Express",
      present: manifestPresent,
      value: manifestPresent
        ? `${Number(express?.package_count ?? 0)} total · ${Number(express?.complete_package_count ?? 0)} complete · ${Number(express?.attempted_package_count ?? 0)} attempted · ${Number(express?.open_package_count ?? 0)} open`
        : "No Express manifest seam",
    },
    {
      label: "FCC",
      present: Boolean(fcc),
      value: fcc
        ? fcc.final_stop_time
          ? `Last Stop ${fcc.final_stop_time}`
          : fcc.last_delivery_time
            ? `Last Delivery ${fcc.last_delivery_time}`
            : fcc.last_transmission_time
              ? `Last Transmission ${fcc.last_transmission_time}`
              : "Route row present"
        : "No closeout row",
    },
  ];

  return (
    <div
      aria-label="Route source evidence"
      className="delivery-window__source-facts"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, minmax(170px, 1fr))",
        gap: 5,
      }}
    >
      {facts.map((fact) => (
        <span
          key={fact.label}
          style={{
            minWidth: 0,
            border: `1px solid ${fact.present ? "#dbeafe" : "#e5e7eb"}`,
            borderRadius: 9,
            background: fact.present ? "#f8fbff" : "#f8fafc",
            padding: "6px 7px",
            display: "grid",
            gap: 2,
          }}
        >
          <small style={{ color: fact.present ? "#1d4ed8" : "#94a3b8", fontSize: 8, fontWeight: 950 }}>
            {fact.label}
          </small>
          <strong
            title={fact.value}
            style={{
              minWidth: 0,
              minHeight: 25,
              whiteSpace: "normal",
              overflowWrap: "anywhere",
              lineHeight: 1.25,
              color: fact.present ? "#334155" : "#94a3b8",
              fontSize: 10,
            }}
          >
            {fact.value}
          </strong>
        </span>
      ))}
    </div>
  );
}
