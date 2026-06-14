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

function routeKey(route: DispatchRoute) {
  return route.current_wa_num ?? route.route_name ?? route.route_key;
}

function rowKey(row: DswCurrentRow) {
  return row.route_baseline_id ?? row.wa_number ?? row.route_name ?? "";
}

function pct(value: number, total: number) {
  if (!total) return "—";
  return `${Math.round((value / total) * 100)}%`;
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

  const byRoute = useMemo(() => {
    const map = new Map<string, DswCurrentRow>();

    for (const row of payload?.rows ?? []) {
      const key = rowKey(row);
      if (key) map.set(key, row);
    }

    return map;
  }, [payload?.rows]);

  const totals = useMemo(() => {
    const rows = payload?.rows ?? [];

    return rows.reduce(
      (acc, row) => {
        acc.routes += 1;
        acc.vscanPackages += Number(row.vscan_packages ?? 0);
        acc.plannedStops += Number(row.planned_delivery_stops ?? 0);
        acc.pickupStops += Number(row.planned_pickup_stops ?? 0);
        acc.actualStops += Number(row.actual_delivery_stops ?? 0);
        acc.actualPackages += Number(row.actual_delivery_packages ?? 0);
        return acc;
      },
      {
        routes: 0,
        vscanPackages: 0,
        plannedStops: 0,
        pickupStops: 0,
        actualStops: 0,
        actualPackages: 0,
      }
    );
  }, [payload?.rows]);

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
            <h2 style={{ margin: 0, fontSize: 18 }}>DSW launch snapshot</h2>
            <p style={{ margin: "4px 0 0", color: "#64748b", fontWeight: 700 }}>
              Current in-day DSW snapshot rendered against today&apos;s route set.
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
          {routes.map((route, index) => {
            const row =
              byRoute.get(route.current_wa_num ?? "") ??
              byRoute.get(route.route_name ?? "") ??
              byRoute.get(routeKey(route));

            const rowKey =
              route.route_key || route.current_wa_num || route.route_name || `route-${index}`;

            return (
              <div key={rowKey}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(180px, 1.2fr) repeat(4, minmax(90px, 0.6fr))",
                  gap: 10,
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
                    {row?.driver_name || route.driver?.full_name || "No driver"} {row?.vehicle_text ? `· Veh ${row.vehicle_text}` : ""}
                  </span>
                </div>

                {row ? (
                  <>
                    <Metric label="Scanned" value={`📦 ${row.vscan_packages ?? 0}`} />
                    <Metric label="Stops" value={`📍 ${row.planned_delivery_stops ?? 0}`} />
                    <Metric label="Pickups" value={`PU ${row.planned_pickup_stops ?? 0}`} />
                    <Metric label="Actual" value={`${row.actual_delivery_stops ?? 0} / ${row.actual_delivery_packages ?? 0}`} />
                  </>
                ) : (
                  <div style={{ gridColumn: "2 / -1", color: "#94a3b8", fontSize: 12, fontWeight: 900 }}>
                    No DSW route row matched
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <aside style={{ ...panel, padding: 14, display: "grid", gap: 10 }}>
        <p style={eyebrow}>DSW posture</p>
        <strong>{payload?.rows?.length ?? 0} DSW routes</strong>

        <RailStat label="DRO routes" value={routes.length} />
        <RailStat label="DSW routes" value={totals.routes} />
        <RailStat label="Route coverage" value={pct(totals.routes, routes.length)} />
        <RailStat label="Scanned packages" value={totals.vscanPackages} />
        <RailStat label="Planned stops" value={totals.plannedStops} />
        <RailStat label="Pickups" value={totals.pickupStops} />
      </aside>
    </section>
  );
}

function Metric(props: { label: string; value: string }) {
  return (
    <div
      style={{
        border: "1px solid #edf2f7",
        borderRadius: 11,
        padding: "7px 9px",
        minHeight: 44,
        display: "grid",
        gap: 2,
      }}
    >
      <span style={{ color: "#64748b", fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {props.label}
      </span>
      <strong style={{ fontSize: 13 }}>{props.value}</strong>
    </div>
  );
}

function RailStat(props: { label: string; value: string | number }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, borderTop: "1px solid #eef2f7", paddingTop: 8 }}>
      <span style={{ color: "#64748b", fontSize: 12, fontWeight: 900 }}>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}
