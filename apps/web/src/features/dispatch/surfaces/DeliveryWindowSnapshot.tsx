"use client";

import { useEffect, useMemo, useState } from "react";
import type { DispatchRoute } from "../lib/dispatchSupport";
import { eyebrow, panel } from "../lib/dispatchSupport";
import OperationsIntelligenceFeed from "@/features/operations/components/OperationsIntelligenceFeed";
import ServiceSnapshotCard from "@/features/operations/components/ServiceSnapshotCard";
import RouteHealthSignal from "@/features/operations/delivery-window/components/RouteHealthSignal";
import {
  computeFccRouteHealth,
  type FccRouteSignalRow,
} from "@/features/operations/delivery-window/lib/fccRouteHealth";

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
  matched_roster_member_id?: string | null;
  matched_roster_full_name?: string | null;
  matched_roster_dswid?: string | null;
};

type DswPayload = {
  source: "DSW";
  snapshot_kind: "IN_DAY";
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

type DeliveryWindowSnapshotProps = {
  slug: string;
  serviceDate: string;
  routes: DispatchRoute[];
  routeLabelForDisplay: (route: DispatchRoute) => string;
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
  const { slug, serviceDate, routes, routeLabelForDisplay } = props;
  const [payload, setPayload] = useState<DswPayload | null>(null);
  const [fccPayload, setFccPayload] = useState<FccPayload | null>(null);
  const [serviceSnapshotPayload, setServiceSnapshotPayload] = useState<any>(null);
  const [routeView, setRouteView] = useState<"all" | "on_road" | "returned">("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadSnapshot() {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(
          `/api/company/${slug}/operations/reports/dsw-current?date=${serviceDate}`,
          { credentials: "include", cache: "no-store" }
        );

        const data = await res.json();

        if (!active) return;

        if (!res.ok) {
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
  }, [serviceDate, slug]);

  useEffect(() => {
    let active = true;

    async function loadFccSnapshot() {
      try {
        const res = await fetch(
          `/api/company/${slug}/operations/reports/fcc-current?date=${serviceDate}`,
          { credentials: "include", cache: "no-store" }
        );

        const data = await res.json().catch(() => null);
        if (!active) return;

        setFccPayload(res.ok ? data : null);
      } catch {
        if (active) setFccPayload(null);
      }
    }

    if (slug && serviceDate) void loadFccSnapshot();

    return () => {
      active = false;
    };
  }, [serviceDate, slug]);

  useEffect(() => {
    let active = true;

    async function loadServiceSnapshot() {
      try {
        const res = await fetch(
          `/api/company/${slug}/operations/reports/dsw-service-snapshot?date=${serviceDate}`,
          { credentials: "include", cache: "no-store" }
        );

        const data = await res.json().catch(() => null);
        if (!active) return;

        setServiceSnapshotPayload(res.ok ? data : null);
      } catch {
        if (active) setServiceSnapshotPayload(null);
      }
    }

    if (slug && serviceDate) void loadServiceSnapshot();

    return () => {
      active = false;
    };
  }, [serviceDate, slug]);

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

  const fccIndex = useMemo(() => {
    const map = new Map<string, FccRouteSignalRow>();

    for (const row of fccPayload?.rows ?? []) {
      const key = normalizeWaNumber(row.wa_number_normalized ?? row.wa_number);
      if (key) map.set(key, row);
    }

    return map;
  }, [fccPayload?.rows]);

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

      const roadHours = row?.normalized_row_json?.on_road_hours ?? null;
      const dutyHours = row?.normalized_row_json?.on_duty_hours ?? null;
      const miles = row?.normalized_row_json?.miles ?? null;

      const returned =
        miles !== null &&
        roadHours !== null &&
        dutyHours !== null;

      const signal = returned
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

      return {
        key: route.route_key || route.current_wa_num || route.route_name || `route-${index}`,
        route,
        row,
        completion,
        signal,
        fccRow,
        fccHealth,
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

        const roadHours = row?.normalized_row_json?.on_road_hours ?? null;
        const dutyHours = row?.normalized_row_json?.on_duty_hours ?? null;
        const miles = row?.normalized_row_json?.miles ?? null;

        const returned = Boolean(miles && roadHours && dutyHours);

        return {
          key: `dsw-active-${dswRowIdentity(row, index) || index}`,
          route: null,
          row,
          completion,
          fccRow,
          fccHealth,
          returned,
          roadHours,
          dutyHours,
          miles,
          signal: driverSignal(
            row.driver_name,
            null,
            row.matched_roster_full_name,
            completion
          ),
          sortOrder: routes.length + routeSortToken(row.route_name ?? row.wa_number),
          configOrder: routes.length + index,
          isConfigRoute: false,
        };
      });

    return [...configuredRows, ...extraActiveRows].sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.configOrder - b.configOrder;
    });
  }, [dswIndex, fccIndex, payload?.rows, routes]);

  const matchedDswIds = useMemo(() => {
    const ids = new Set<DswCurrentRow>();

    for (const item of routeRows) {
      if (item.row) ids.add(item.row);
    }

    return ids;
  }, [routeRows]);

  const dswRows = payload?.rows ?? [];

  
console.log(
  "DSW return-state inspect",
  dswRows
    .filter((row) => row.route_name)
    .slice(0, 25)
    .map((row) => ({
      route: row.route_name,
      driver: row.driver_name,
      ils_percent: row.ils_percent,
      miles: row.normalized_row_json?.miles,
      on_road_hours: row.normalized_row_json?.on_road_hours,
      on_duty_hours: row.normalized_row_json?.on_duty_hours,
    }))
);

  console.log("DSW row ILS inspect", dswRows.slice(0, 5).map((row) => ({
    route_name: row.route_name,
    wa_number: row.wa_number,
    driver_name: row.driver_name,
    ils_percent: row.ils_percent,
    keys: Object.keys(row),
  })));
  const activeDswRows = dswRows.filter(isActiveDswRow);
  const hiddenEmptyDswRows = dswRows.filter((row) => !isActiveDswRow(row));
  const unplannedActiveRows = activeDswRows.filter((row) => !matchedDswIds.has(row));

  const visibleRouteRows = useMemo(() => {
    switch (routeView) {
      case "on_road":
        return routeRows.filter((row) => !row.returned);

      case "returned":
        return routeRows.filter((row) => row.returned);

      default:
        return routeRows;
    }
  }, [routeRows, routeView]);

  const driverStats = routeRows.reduce(
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
    const plannedStops = routeRows.reduce(
      (sum, item) => sum + Number(item.row?.planned_delivery_stops ?? 0),
      0
    );
    const actualStops = routeRows.reduce(
      (sum, item) => sum + Number(item.row?.actual_delivery_stops ?? 0),
      0
    );

    if (plannedStops > 0) return pct(actualStops, plannedStops);

    const plannedPackages = routeRows.reduce(
      (sum, item) => sum + Number(item.row?.vscan_packages ?? 0),
      0
    );
    const actualPackages = routeRows.reduce(
      (sum, item) => sum + Number(item.row?.actual_delivery_packages ?? 0),
      0
    );

    return pct(actualPackages, plannedPackages);
  }, [routeRows]);


  const executionTotals = useMemo(() => {
    return routeRows.reduce(
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
  }, [routeRows]);

  const companyIlsPercent = findContractIlsPercent(serviceSnapshotPayload) ?? "—";

  return (
    <section className="delivery-window-grid">
      <section style={{ ...panel, padding: 14, display: "grid", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <p style={eyebrow}>Delivery Window</p>
            <h2 style={{ margin: 0, fontSize: 18 }}>DSW/FCC sourced execution overview</h2>
            <p style={{ margin: "4px 0 0", color: "#64748b", fontWeight: 700 }}>
              Live operational snapshot of route progress, service completion, and delivery health.
            </p>
          </div>

          <div style={{ textAlign: "right", color: "#64748b", fontSize: 12, fontWeight: 900 }}>
            <div>{payload?.terminal_identity ?? "No terminal"}</div>
            <div>{payload?.generated_at_text ?? "No DSW loaded"}</div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
            gap: 8,
            borderTop: "1px solid #e5ecf6",
            paddingTop: 10,
          }}
        >
          {[
            ["Routes / Logged In", `${executionTotals.activeRoutes} / ${executionTotals.loggedIn}`],
            ["📍 Del Stops", `${executionTotals.actualStops.toLocaleString()} / ${executionTotals.plannedStops.toLocaleString()}`],
            ["📦 Del Packages", `${executionTotals.actualPackages.toLocaleString()} / ${executionTotals.plannedPackages.toLocaleString()}`],
            ["🛻 Pickups", `${executionTotals.actualPickupStops.toLocaleString()} / ${executionTotals.plannedPickupStops.toLocaleString()}`],
            ["🕒 Express", "—"],
            ["ILS %", companyIlsPercent],
            ["Completion", `${fleetCompletion}%`],
          ].map(([label, value]) => (
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
        </div>

        {error ? (
          <div style={{ border: "1px solid #fecaca", background: "#fef2f2", color: "#991b1b", borderRadius: 12, padding: 10, fontSize: 13, fontWeight: 800 }}>
            {error}
          </div>
        ) : null}

        {loading ? (
          <div style={{ padding: 12, color: "#64748b", fontWeight: 800 }}>Loading DSW snapshot...</div>
        ) : null}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
          {[
            ["all", "All Routes"],
            ["on_road", "On Road"],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setRouteView(key as "all" | "on_road")}
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

        <div style={{ display: "grid", gap: 8 }}>
          {visibleRouteRows.map((item) => {
            const { route, row, signal, completion, fccHealth } = item;

            return (
              <div
                key={item.key}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(180px, 1.1fr) minmax(280px, 1.5fr) 72px",
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
                <div style={{ minWidth: 0 }}>
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
                </div>

                {row ? (
                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      flexWrap: "wrap",
                      color: "#334155",
                      fontSize: 13,
                      fontWeight: 900,
                    }}
                  >
                    <ProgressPill
                      icon="📍"
                      actual={row.actual_delivery_stops ?? 0}
                      planned={row.planned_delivery_stops ?? 0}
                    />
                    <ProgressPill
                      icon="📦"
                      actual={row.actual_delivery_packages ?? 0}
                      planned={row.vscan_packages ?? 0}
                    />
                    <ProgressPill
                      icon="🛻"
                      actual={row.actual_pickup_stops ?? 0}
                      planned={row.planned_pickup_stops ?? 0}
                    />
                  </div>
                ) : (
                  <div style={{ color: "#94a3b8", fontSize: 12, fontWeight: 900 }}>
                    No active DSW row matched
                  </div>
                )}

                <div
                  style={{
                    justifySelf: "end",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <RouteHealthSignal health={fccHealth} />
                  <div
                    style={{
                      minWidth: 64,
                      textAlign: "center",
                      borderRadius: 13,
                      padding: "8px 10px",
                      border: "1px solid #e6edf5",
                      background: completion >= 100 ? "#ecfdf5" : "#f8fafc",
                      color: completion >= 100 ? "#166534" : "#0f172a",
                      fontWeight: 950,
                    }}
                  >
                    {completion}%
                  </div>
                </div>
              </div>
            );
          })}
        </div>

      </section>

      <aside style={{ display: "grid", gap: 12 }}>
        <OperationsIntelligenceFeed
          slug={slug}
          serviceDate={serviceDate}
          surface="delivery-window"
        />

        <ServiceSnapshotCard slug={slug} serviceDate={serviceDate} />
      </aside>
    </section>
  );
}

function ProgressPill(props: {
  icon: string;
  actual: number;
  planned: number;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        border: "1px solid #edf2f7",
        borderRadius: 999,
        padding: "7px 10px",
        background: "#f8fafc",
        whiteSpace: "nowrap",
      }}
    >
      {props.icon} {props.actual} of {props.planned}
    </span>
  );
}

function RailStat(props: { label: string; value: string | number }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        border: "1px solid #edf2f7",
        borderRadius: 12,
        padding: "9px 10px",
        alignItems: "center",
      }}
    >
      <span style={{ color: "#64748b", fontSize: 12, fontWeight: 900 }}>
        {props.label}
      </span>
      <strong>{props.value}</strong>
    </div>
  );
}
