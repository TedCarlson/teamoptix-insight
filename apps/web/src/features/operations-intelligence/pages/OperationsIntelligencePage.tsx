"use client";

import { useEffect, useMemo, useState } from "react";
import OperationsReportUploadOverlay from "@/features/operations/components/OperationsReportUploadOverlay";
import OperationsWorkspaceToolbar from "@/features/operations/components/OperationsWorkspaceToolbar";
import { eyebrow, panel } from "@/features/dispatch/lib/dispatchSupport";
import { timeCriticalColor } from "@/features/dispatch/lib/droPlanSignals";

type Props = { slug: string };

type DroPlanRow = {
  route_baseline_id?: string | null;
  route_name?: string | null;
  wa_number?: string | null;
  stops?: number | string | null;
  packages?: number | string | null;
  time_commits?: number | string | null;
  miles?: number | string | null;
  miles_per_stop?: number | string | null;
  minutes_per_stop?: number | string | null;
};

type DroPayload = {
  source_frame?: "AM" | "PM" | string | null;
  fallback_used?: boolean;
  source_date?: string | null;
  source_mode?: "PLANNING" | "BASELINE" | string | null;
  rows?: DroPlanRow[];
};

type DroTotals = {
  routes: number;
  stops: number;
  packages: number;
  timeCommits: number;
  miles: number;
};

function todayNyIso() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDaysIso(dateIso: string, days: number) {
  const d = new Date(`${dateIso}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function n(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function fmt(value: unknown, digits = 0) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return "—";

  return parsed.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function routeLabel(row: DroPlanRow) {
  const route = String(row.route_name ?? "Unlabeled route").trim();
  const wa = String(row.wa_number ?? "").trim();
  return wa ? `${route} · ${wa}` : route;
}

function sortRows(rows: DroPlanRow[], routeSortKey: "route_name" | "current_wa_num") {
  return [...rows].sort((a, b) => {
    const aValue =
      routeSortKey === "current_wa_num"
        ? String(a.wa_number ?? a.route_name ?? "")
        : String(a.route_name ?? a.wa_number ?? "");

    const bValue =
      routeSortKey === "current_wa_num"
        ? String(b.wa_number ?? b.route_name ?? "")
        : String(b.route_name ?? b.wa_number ?? "");

    return aValue.localeCompare(bValue, undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });
}

export default function OperationsIntelligencePage({ slug }: Props) {
  const todayDate = todayNyIso();
  const planningDate = addDaysIso(todayDate, 1);

  const [uploadOverlayOpen, setUploadOverlayOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string>(() => new Date().toISOString());
  const [payload, setPayload] = useState<DroPayload | null>(null);
  const [selectedRouteKey, setSelectedRouteKey] = useState<string | null>(null);
  const [routeSortKey, setRouteSortKey] = useState<"route_name" | "current_wa_num">("route_name");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function refreshWorkspace() {
    setRefreshKey((current) => current + 1);
    setLastUpdatedAt(new Date().toISOString());
  }


  useEffect(() => {
    let active = true;

    async function loadOperationsConfig() {
      try {
        const res = await fetch(`/api/company/${slug}/config/operations`, {
          credentials: "include",
          cache: "no-store",
        });

        const data = await res.json().catch(() => ({}));

        if (!active || !res.ok) return;

        setRouteSortKey(
          data?.config?.route_sort_key === "current_wa_num"
            ? "current_wa_num"
            : "route_name"
        );
      } catch {
        if (active) setRouteSortKey("route_name");
      }
    }

    if (slug) void loadOperationsConfig();

    return () => {
      active = false;
    };
  }, [slug, refreshKey]);

  useEffect(() => {
    let active = true;

    async function loadDroPlan() {
      try {
        setLoading(true);
        setError(null);

        const candidates = [
          { date: planningDate, frame: "PM", mode: "PLANNING" },
          { date: todayDate, frame: "AM", mode: "BASELINE" },
          { date: todayDate, frame: "PM", mode: "BASELINE" },
        ] as const;

        let selectedPayload: DroPayload | null = null;

        for (const candidate of candidates) {
          const res = await fetch(
            `/api/company/${slug}/operations/reports/dro-plan?date=${candidate.date}&frame=${candidate.frame}`,
            { credentials: "include", cache: "no-store" }
          );

          const data = await res.json().catch(() => ({}));

          if (!res.ok) {
            throw new Error(data?.error ?? `Failed to load ${candidate.frame} DRO plan.`);
          }

          const candidateRows = Array.isArray(data?.rows) ? data.rows : [];

          if (candidateRows.length > 0 || candidate === candidates[candidates.length - 1]) {
            selectedPayload = {
              ...data,
              source_date: candidate.date,
              source_frame: candidate.frame,
              source_mode: candidate.mode,
            };
          }

          if (candidateRows.length > 0) break;
        }

        if (!active) return;
        setPayload(selectedPayload);
      } catch (err) {
        if (!active) return;
        setPayload(null);
        setError(err instanceof Error ? err.message : "Failed to load Planning data.");
      } finally {
        if (active) setLoading(false);
      }
    }

    if (slug && planningDate) void loadDroPlan();

    return () => {
      active = false;
    };
  }, [planningDate, refreshKey, slug, todayDate]);

  const rows = useMemo(() => sortRows(payload?.rows ?? [], routeSortKey), [payload?.rows, routeSortKey]);

  const totals = useMemo<DroTotals>(
    () =>
      rows.reduce<DroTotals>(
        (acc, row) => {
          acc.routes += 1;
          acc.stops += n(row.stops);
          acc.packages += n(row.packages);
          acc.timeCommits += n(row.time_commits);
          acc.miles += n(row.miles);
          return acc;
        },
        {
          routes: 0,
          stops: 0,
          packages: 0,
          timeCommits: 0,
          miles: 0,
        }
      ),
    [rows]
  );

  const selectedRoute =
    rows.find((row) => {
      const key = row.route_baseline_id ?? row.wa_number ?? row.route_name ?? "";
      return key === selectedRouteKey;
    }) ??
    rows[0] ??
    null;

  return (
    <main className="workspace-shell">
      <section className="workspace-main" style={{ paddingTop: 12 }}>
        <OperationsWorkspaceToolbar
          lastUpdatedAt={lastUpdatedAt}
          onRefresh={refreshWorkspace}
          onUpload={() => setUploadOverlayOpen(true)}
        />

        {error ? (
          <section className="panel" style={{ marginTop: 12, padding: 12, color: "#991b1b", fontWeight: 800 }}>
            {error}
          </section>
        ) : null}

        {loading ? (
          <section className="panel" style={{ marginTop: 12, padding: 12, color: "#64748b", fontWeight: 800 }}>
            Loading Planning DRO...
          </section>
        ) : (
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
                  <p style={eyebrow}>Planning</p>
                  <h2 style={{ margin: 0, fontSize: 18 }}>DRO planning snapshot</h2>
                  <p style={{ margin: "4px 0 0", color: "#64748b", fontWeight: 700 }}>
                    {payload?.source_mode === "PLANNING"
                      ? `Latest available planning DRO for ${payload?.source_date ?? planningDate}. PM is preferred when present.`
                      : `Baseline read surface from latest available DRO for ${payload?.source_date ?? todayDate}. Upload PM DRO when the planning file is ready.`}
                  </p>
                </div>

                <div style={{ textAlign: "right", color: "#64748b", fontSize: 12, fontWeight: 900 }}>
                  <div>{payload?.source_frame ?? "No frame"} frame</div>
                  <div>{rows.length > 0 ? `${rows.length} DRO rows loaded` : "No DRO loaded"}</div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
                <Metric label="Routes" value={totals.routes} />
                <Metric label="Stops" value={totals.stops} />
                <Metric label="Packages" value={totals.packages} />
                <Metric label="Time commits" value={totals.timeCommits} />
              </div>

              <div style={{ display: "grid", gap: 8 }}>
                {rows.map((row, index) => {
                  const key =
                    row.route_baseline_id ??
                    row.wa_number ??
                    row.route_name ??
                    `dro-row-${index}`;

                  const selected =
                    key ===
                    (selectedRoute?.route_baseline_id ??
                      selectedRoute?.wa_number ??
                      selectedRoute?.route_name ??
                      "");

                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelectedRouteKey(key)}
                      style={{
                        width: "100%",
                        display: "grid",
                        gridTemplateColumns: "minmax(180px, 1.15fr) minmax(0, 2.6fr) minmax(160px, 0.9fr)",
                        gap: 10,
                        alignItems: "center",
                        padding: "10px 12px",
                        borderRadius: 14,
                        border: selected ? "1px solid #93c5fd" : "1px solid #e6edf5",
                        background: selected ? "#eff6ff" : "#fff",
                        textAlign: "left",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <strong
                          style={{
                            display: "block",
                            color: "#0f172a",
                            fontSize: 14,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {routeLabel(row)}
                        </strong>
                        <span
                          style={{
                            display: "block",
                            color: "#64748b",
                            fontSize: 12,
                            fontWeight: 800,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          WA {row.wa_number ?? "—"} · {payload?.source_frame ?? "DRO"} plan
                        </span>
                      </div>

                      <DroPlanningSignal row={row} />

                      <div style={{ display: "grid", gap: 3, color: "#64748b", fontSize: 11, fontWeight: 850 }}>
                        <span style={{ textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 950 }}>Assigned Driver</span>
                        <strong style={{ color: "#0f172a", fontSize: 13 }}>Pending schedule link</strong>
                      </div>
                    </button>
                  );
                })}

                {rows.length === 0 ? (
                  <div style={{ padding: 14, color: "#64748b", fontWeight: 850 }}>
                    No DRO rows loaded for {payload?.source_date ?? planningDate}.
                  </div>
                ) : null}
              </div>
            </section>

            <aside style={{ ...panel, padding: 14, display: "grid", gap: 10 }}>
              <p style={eyebrow}>Planning rail</p>
              <strong>{selectedRoute ? routeLabel(selectedRoute) : "No route selected"}</strong>

              <RailStat label="Planning date" value={planningDate} />
              <RailStat label="DRO source date" value={payload?.source_date ?? "—"} />
              <RailStat label="DRO mode" value={payload?.source_mode ?? "—"} />
              <RailStat label="DRO frame" value={payload?.source_frame ?? "—"} />
              <RailStat label="Stops" value={selectedRoute ? fmt(selectedRoute.stops) : "—"} />
              <RailStat label="Packages" value={selectedRoute ? fmt(selectedRoute.packages) : "—"} />
              <RailStat label="Miles" value={selectedRoute?.miles == null ? "—" : fmt(selectedRoute.miles, 1)} />

              <div style={{ borderTop: "1px solid #e6edf5", paddingTop: 10, color: "#64748b", fontSize: 12, fontWeight: 850 }}>
                Route readiness detail placeholder. Historical comparison and driver readiness will land here after the DRO table shape is stable.
              </div>
            </aside>
          </section>
        )}
      </section>

      <OperationsReportUploadOverlay
        open={uploadOverlayOpen}
        onClose={(shouldRefresh) => {
          setUploadOverlayOpen(false);
          if (shouldRefresh) refreshWorkspace();
        }}
      />
    </main>
  );
}

function Metric(props: { label: string; value: number }) {
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
      <strong style={{ fontSize: 13 }}>{fmt(props.value)}</strong>
    </div>
  );
}

function RailStat(props: { label: string; value: string | number }) {
  return (
    <div style={{ border: "1px solid #edf2f7", borderRadius: 12, padding: 10 }}>
      <span style={{ display: "block", color: "#64748b", fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {props.label}
      </span>
      <strong style={{ display: "block", marginTop: 3, fontSize: 15 }}>{props.value}</strong>
    </div>
  );
}

function DroPlanningSignal({ row }: { row: DroPlanRow }) {
  return (
    <span
      title={[
        `${fmt(row.stops)} stops`,
        `${fmt(row.packages)} packages`,
        `${fmt(row.time_commits)} time commits`,
        row.miles == null ? null : `${fmt(row.miles, 1)} miles`,
        row.miles_per_stop == null ? null : `${fmt(row.miles_per_stop, 2)} mi/stop`,
        row.minutes_per_stop == null ? null : `${fmt(row.minutes_per_stop, 1)} min/stop`,
      ].filter(Boolean).join(" · ")}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
        color: "#334155",
        fontSize: 12,
        fontWeight: 900,
        whiteSpace: "normal",
      }}
    >
      <span>📍 {fmt(row.stops)}</span>
      <span>📦 {fmt(row.packages)}</span>
      <span style={{ color: timeCriticalColor(n(row.time_commits)) }}>🕒 {fmt(row.time_commits)}</span>
      <span style={{ color: "#4d148c" }}>🚚 {row.miles == null ? "—" : fmt(row.miles, 1)}</span>
      <span>⚡ {row.miles_per_stop == null ? "—" : fmt(row.miles_per_stop, 2)}</span>
      <span>⏱ {row.minutes_per_stop == null ? "—" : fmt(row.minutes_per_stop, 1)}</span>
    </span>
  );
}
