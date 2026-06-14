"use client";

import { useEffect, useMemo, useState } from "react";
import type { DispatchRoute } from "../lib/dispatchSupport";
import { eyebrow, panel } from "../lib/dispatchSupport";

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
  route_match_method: string | null;
};

type DswPayload = {
  source: "DSW";
  snapshot_kind: "IN_DAY";
  generated_at_text: string | null;
  terminal_identity: string | null;
  contract_filter: string | null;
  rows: DswCurrentRow[];
};

type DeliveryWindowSnapshotProps = {
  slug: string;
  serviceDate: string;
  routes: DispatchRoute[];
  routeLabelForDisplay: (route: DispatchRoute) => string;
};

function normalizeKey(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^wa\s+/i, "")
    .replace(/[^a-z0-9]+/g, "");
}

function normalizeName(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function routeKey(route: DispatchRoute) {
  return route.current_wa_num ?? route.route_name ?? route.route_key;
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

function driverSignal(
  rowDriver: string | null | undefined,
  dispatchDriver: string | null | undefined,
  completion: number
) {
  const dsw = String(rowDriver ?? "").trim();
  const dispatch = String(dispatchDriver ?? "").trim();

  if (completion >= 100) {
    return { label: "Complete", tone: "#166534", icon: "✅", key: "complete" };
  }

  if (!dispatch && !dsw) {
    return { label: "No Dispatch Driver", tone: "#64748b", icon: "⚪", key: "no_dispatch_driver" };
  }

  if (dispatch && !dsw) {
    return { label: "Awaiting Login", tone: "#92400e", icon: "🟡", key: "awaiting_login" };
  }

  if (!dispatch && dsw) {
    return { label: "Logged In / Unassigned", tone: "#7c2d12", icon: "🟠", key: "logged_in_unassigned" };
  }

  if (normalizeName(dispatch) === normalizeName(dsw)) {
    return { label: "Logged In", tone: "#166534", icon: "🟢", key: "logged_in" };
  }

  return { label: "Driver Mismatch", tone: "#991b1b", icon: "🟠", key: "driver_mismatch" };
}

export function DeliveryWindowSnapshot(props: DeliveryWindowSnapshotProps) {
  const { slug, serviceDate, routes, routeLabelForDisplay } = props;
  const [payload, setPayload] = useState<DswPayload | null>(null);
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

  const dswIndex = useMemo(() => {
    const map = new Map<string, DswCurrentRow>();

    for (const row of payload?.rows ?? []) {
      for (const key of [
        row.route_baseline_id,
        row.wa_number,
        row.route_name,
      ]) {
        const normalized = normalizeKey(key);
        if (normalized) map.set(normalized, row);
      }
    }

    return map;
  }, [payload?.rows]);

  const routeRows = useMemo(() => {
    return routes.map((route, index) => {
      const row =
        dswIndex.get(normalizeKey(route.current_wa_num)) ??
        dswIndex.get(normalizeKey(route.route_name)) ??
        dswIndex.get(normalizeKey(route.route_key)) ??
        dswIndex.get(normalizeKey(routeKey(route))) ??
        null;

      const completion = completionPct(row);
      const signal = driverSignal(row?.driver_name, route.driver?.full_name, completion);

      return {
        key: route.route_key || route.current_wa_num || route.route_name || `route-${index}`,
        route,
        row,
        completion,
        signal,
      };
    });
  }, [dswIndex, routes]);

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

  return (
    <section
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) 320px",
        gap: 12,
        marginTop: 10,
        alignItems: "start",
      }}
    >
      <section style={{ ...panel, padding: 14, display: "grid", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <p style={eyebrow}>Delivery Window</p>
            <h2 style={{ margin: 0, fontSize: 18 }}>Launch + execution control tower</h2>
            <p style={{ margin: "4px 0 0", color: "#64748b", fontWeight: 700 }}>
              Planned dispatch routes enriched with active DSW launch data.
            </p>
          </div>

          <div style={{ textAlign: "right", color: "#64748b", fontSize: 12, fontWeight: 900 }}>
            <div>{payload?.terminal_identity ?? "No terminal"}</div>
            <div>{payload?.generated_at_text ?? "No DSW loaded"}</div>
          </div>
        </div>

        {error ? (
          <div style={{ border: "1px solid #fecaca", background: "#fef2f2", color: "#991b1b", borderRadius: 12, padding: 10, fontSize: 13, fontWeight: 800 }}>
            {error}
          </div>
        ) : null}

        {loading ? (
          <div style={{ padding: 12, color: "#64748b", fontWeight: 800 }}>Loading DSW snapshot...</div>
        ) : null}

        <div style={{ display: "grid", gap: 8 }}>
          {routeRows.map((item) => {
            const { route, row, signal, completion } = item;

            return (
              <div
                key={item.key}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(200px, 1.15fr) minmax(360px, 1.5fr) 82px",
                  gap: 12,
                  alignItems: "center",
                  padding: "10px 12px",
                  borderRadius: 14,
                  border: "1px solid #e6edf5",
                  background: "#fff",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <strong style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {routeLabelForDisplay(route)}
                  </strong>
                  <span style={{ display: "block", color: "#64748b", fontSize: 12, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {route.driver?.full_name || row?.driver_name || "No driver"}
                    {row?.vehicle_text ? ` · Veh ${row.vehicle_text}` : ""}
                  </span>
                  <span
                    style={{
                      display: "inline-flex",
                      marginTop: 4,
                      color: signal.tone,
                      fontSize: 11,
                      fontWeight: 900,
                    }}
                  >
                    {signal.icon} {signal.label}
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
                      icon="📦"
                      actual={row.actual_delivery_packages ?? 0}
                      planned={row.vscan_packages ?? 0}
                      label="packages"
                    />
                    <ProgressPill
                      icon="📍"
                      actual={row.actual_delivery_stops ?? 0}
                      planned={row.planned_delivery_stops ?? 0}
                      label="stops"
                    />
                    <ProgressPill
                      icon="🕒"
                      actual={0}
                      planned={0}
                      label="commits"
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
            );
          })}
        </div>

        {unplannedActiveRows.length > 0 ? (
          <section style={{ marginTop: 8, display: "grid", gap: 8 }}>
            <p style={{ ...eyebrow, marginTop: 6 }}>Unplanned Active Routes</p>
            {unplannedActiveRows.map((row, index) => (
              <div
                key={dswRowIdentity(row, index)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(180px, 1fr) minmax(300px, 1.4fr)",
                  gap: 10,
                  alignItems: "center",
                  padding: "10px 12px",
                  borderRadius: 14,
                  border: "1px solid #fed7aa",
                  background: "#fff7ed",
                }}
              >
                <div>
                  <strong>{row.route_name ?? row.wa_number ?? "Unplanned route"}</strong>
                  <span style={{ display: "block", color: "#9a3412", fontSize: 12, fontWeight: 900 }}>
                    WA {row.wa_number ?? "—"} · {row.route_match_method ?? "No match"}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 13, fontWeight: 900 }}>
                  <ProgressPill icon="📦" actual={row.actual_delivery_packages ?? 0} planned={row.vscan_packages ?? 0} label="packages" />
                  <ProgressPill icon="📍" actual={row.actual_delivery_stops ?? 0} planned={row.planned_delivery_stops ?? 0} label="stops" />
                  <ProgressPill icon="🕒" actual={0} planned={0} label="commits" />
                </div>
              </div>
            ))}
          </section>
        ) : null}
      </section>

      <aside style={{ ...panel, padding: 14, display: "grid", gap: 10 }}>
        <p style={eyebrow}>Delivery posture</p>
        <strong style={{ fontSize: 24 }}>{fleetCompletion}%</strong>
        <span style={{ marginTop: -8, color: "#64748b", fontSize: 12, fontWeight: 900 }}>
          Fleet completion
        </span>

        <RailStat label="Planned routes" value={routes.length} />
        <RailStat label="Active DSW routes" value={activeDswRows.length} />
        <RailStat label="Unplanned active" value={unplannedActiveRows.length} />
        <RailStat label="Hidden empty DSW rows" value={hiddenEmptyDswRows.length} />

        <div style={{ height: 1, background: "#e6edf5", margin: "4px 0" }} />

        <RailStat label="Awaiting login" value={driverStats.awaitingLogin} />
        <RailStat label="Logged in" value={driverStats.loggedIn} />
        <RailStat label="Driver mismatch" value={driverStats.mismatch} />
        <RailStat label="No dispatch driver" value={driverStats.noDriver} />
      </aside>
    </section>
  );
}

function ProgressPill(props: {
  icon: string;
  actual: number;
  planned: number;
  label: string;
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
      {props.icon} {props.actual} of {props.planned} {props.label}
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
