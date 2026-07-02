"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import OperationsReportUploadOverlay from "@/features/operations/components/OperationsReportUploadOverlay";
import OperationsWorkspaceToolbar from "@/features/operations/components/OperationsWorkspaceToolbar";
import {
  cleanRouteKey,
  eyebrow,
  panel,
  type DispatchPerson,
  type GeneratedScheduleRow,
} from "@/features/dispatch/lib/dispatchSupport";
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

type DispatchEventRow = {
  event_code: string;
  route_key: string | null;
  to_route_key?: string | null;
  person_roster_member_id: string | null;
  person_name: string | null;
  created_at: string;
};

type PlanningAssignment = {
  driver: DispatchPerson;
  source: "Dispatch" | "Schedule";
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

function driverFromScheduleRow(row: GeneratedScheduleRow): DispatchPerson {
  return {
    roster_member_id: row.roster_member_id,
    full_name: row.full_name?.trim() || "Unnamed worker",
    worker_type: row.worker_type,
    source_kind: row.source_kind,
    override_type: row.override_type,
  };
}

function driverFromDispatchEvent(event: DispatchEventRow): DispatchPerson | null {
  if (!event.person_roster_member_id || !event.person_name) return null;

  return {
    roster_member_id: event.person_roster_member_id,
    full_name: event.person_name,
    worker_type: null,
    source_kind: "DISPATCH_EVENT",
    override_type: null,
  };
}

function scheduleSeat(row: GeneratedScheduleRow) {
  const worker = (row.worker_type ?? "").toLowerCase();
  const name = (row.full_name ?? "").toLowerCase();
  const combined = `${worker} ${name}`;

  if (combined.includes("trainee")) return "trainee";
  if (combined.includes("helper") || combined.includes("jumper")) return "helper";
  return "driver";
}

function assignmentKeysForDroRow(row: DroPlanRow) {
  return [
    row.wa_number ? cleanRouteKey(String(row.wa_number)) : "",
    row.route_name ? cleanRouteKey(String(row.route_name)) : "",
  ].filter(Boolean);
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

export default function PlanningPage({ slug }: Props) {
  const todayDate = todayNyIso();
  const planningDate = addDaysIso(todayDate, 1);

  const [uploadOverlayOpen, setUploadOverlayOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string>(() => new Date().toISOString());
  const [payload, setPayload] = useState<DroPayload | null>(null);
  const [selectedRouteKey, setSelectedRouteKey] = useState<string | null>(null);
  const [routeSortKey, setRouteSortKey] = useState<"route_name" | "current_wa_num">("route_name");
  const [assignmentsByRouteKey, setAssignmentsByRouteKey] = useState<Record<string, PlanningAssignment>>({});
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


  useEffect(() => {
    let active = true;

    async function loadAssignments() {
      try {
        const [scheduleRes, dispatchRes] = await Promise.all([
          fetch(`/api/company/${slug}/schedule/generated?date=${planningDate}`, {
            credentials: "include",
            cache: "no-store",
          }),
          fetch(`/api/company/${slug}/dispatch/day?date=${planningDate}`, {
            credentials: "include",
            cache: "no-store",
          }),
        ]);

        const [scheduleData, dispatchData] = await Promise.all([
          scheduleRes.json().catch(() => ({})),
          dispatchRes.json().catch(() => ({})),
        ]);

        if (!active) return;

        const next: Record<string, PlanningAssignment> = {};

        if (scheduleRes.ok) {
          for (const row of (scheduleData?.rows ?? []) as GeneratedScheduleRow[]) {
            if (row.service_date !== planningDate || !row.planned_on) continue;
            if (scheduleSeat(row) !== "driver") continue;
            if (!row.route_name) continue;

            next[cleanRouteKey(row.route_name)] = {
              driver: driverFromScheduleRow(row),
              source: "Schedule",
            };
          }
        }

        if (dispatchRes.ok) {
          const events = [...((dispatchData?.events ?? []) as DispatchEventRow[])].sort((a, b) =>
            a.created_at.localeCompare(b.created_at)
          );

          for (const event of events) {
            const routeKey = event.route_key ?? event.to_route_key ?? null;
            const driver = driverFromDispatchEvent(event);

            if (event.event_code === "ASSIGN_DRIVER" && routeKey && driver) {
              for (const [key, assignment] of Object.entries(next)) {
                if (assignment.driver.roster_member_id === driver.roster_member_id) {
                  delete next[key];
                }
              }

              next[routeKey] = {
                driver,
                source: "Dispatch",
              };
            }

            if (event.event_code === "UNASSIGN_DRIVER" && routeKey) {
              delete next[routeKey];
            }
          }
        }

        setAssignmentsByRouteKey(next);
      } catch {
        if (active) setAssignmentsByRouteKey({});
      }
    }

    if (slug && planningDate) void loadAssignments();

    return () => {
      active = false;
    };
  }, [planningDate, refreshKey, slug]);

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

  const assignmentForRow = useCallback((row: DroPlanRow | null) => {
    if (!row) return null;

    for (const key of assignmentKeysForDroRow(row)) {
      const assignment = assignmentsByRouteKey[key];
      if (assignment) return assignment;
    }

    return null;
  }, [assignmentsByRouteKey]);

  const selectedRoute =
    rows.find((row) => {
      const key = row.route_baseline_id ?? row.wa_number ?? row.route_name ?? "";
      return key === selectedRouteKey;
    }) ??
    rows[0] ??
    null;

  const planningSummary = useMemo(() => {
    const assignmentRows = rows.map((row) => assignmentForRow(row));
    const dispatchAssignments = assignmentRows.filter((item) => item?.source === "Dispatch").length;
    const scheduleAssignments = assignmentRows.filter((item) => item?.source === "Schedule").length;
    const assignedRoutes = dispatchAssignments + scheduleAssignments;
    const openSeats = Math.max(0, rows.length - assignedRoutes);
    const avgStops = rows.length ? totals.stops / rows.length : 0;
    const peakRoute = rows.reduce<DroPlanRow | null>((peak, row) => {
      if (!peak) return row;
      return n(row.stops) > n(peak.stops) ? row : peak;
    }, null);
    const routesAboveAverage = rows.filter((row) => avgStops > 0 && n(row.stops) > avgStops * 1.15).length;

    return {
      assignedRoutes,
      openSeats,
      dispatchAssignments,
      scheduleAssignments,
      unassignedRoutes: openSeats,
      avgStops,
      peakRoute,
      routesAboveAverage,
      readinessLabel: openSeats === 0 ? "Driver coverage ready" : `${openSeats} open driver ${openSeats === 1 ? "seat" : "seats"}`,
    };
  }, [rows, totals.stops, assignmentForRow]);

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
                  <h2 style={{ margin: 0, fontSize: 18 }}>Planning snapshot</h2>
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

              <section
                style={{
                  border: "1px solid #edf2f7",
                  borderRadius: 14,
                  padding: 12,
                  display: "grid",
                  gap: 4,
                  background: "#f8fafc",
                }}
              >
                <p style={{ ...eyebrow, color: "#009b67" }}>Company Intelligence</p>
                <strong style={{ fontSize: 15 }}>{planningSummary.readinessLabel}</strong>
                <span style={{ color: "#64748b", fontSize: 12, fontWeight: 850 }}>
                  Company-level historical demand, driver coverage confidence, and workload change signals will land here.
                </span>
              </section>

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
                        gridTemplateColumns: "minmax(160px, 0.9fr) minmax(260px, 1.45fr) minmax(145px, 0.7fr) minmax(160px, 0.75fr)",
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


                      <div
                        style={{
                          display: "grid",
                          gap: 2,
                          minWidth: 150,
                          justifyItems: "start",
                        }}
                      >
                        {(() => {
                          const assignment = assignmentForRow(row);

                          return (
                            <>
                              <strong
                                style={{
                                  color: assignment ? "#0f172a" : "#64748b",
                                  fontSize: 13,
                                  fontWeight: assignment ? 800 : 650,
                                }}
                              >
                                {assignment?.driver.full_name ?? "Open driver seat"}
                              </strong>
                              <span
                                style={{
                                  fontSize: 11,
                                  fontWeight: 700,
                                  color:
                                    assignment?.source === "Dispatch"
                                      ? "#2563eb"
                                      : assignment?.source === "Schedule"
                                        ? "#64748b"
                                        : "#94a3b8",
                                }}
                              >
                                {assignment?.source ?? "Unassigned"}
                              </span>
                            </>
                          );
                        })()}
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gap: 2,
                          minWidth: 150,
                          justifyItems: "start",
                          color: "#64748b",
                          fontSize: 11,
                          fontWeight: 850,
                        }}
                      >
                        <strong style={{ color: "#334155", fontSize: 13 }}>
                          Intelligence pending
                        </strong>
                        <span>Historical signal next</span>
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
              <div>
                <p style={eyebrow}>Planning Readiness</p>
                <strong>{planningSummary.readinessLabel}</strong>
                <p style={{ margin: "5px 0 0", color: "#64748b", fontSize: 12, fontWeight: 850 }}>
                  Plan {payload?.source_date ?? "—"} · Report {planningDate}
                </p>
              </div>

              <RailSection title="DRO Facts">
                <RailStat label="Routes" value={totals.routes} />
                <RailStat label="Stops" value={fmt(totals.stops)} />
                <RailStat label="Packages" value={fmt(totals.packages)} />
                <RailStat label="Time commits" value={fmt(totals.timeCommits)} />
              </RailSection>

              <RailSection title="Driver Coverage">
                <RailStat label="Assigned" value={`${planningSummary.assignedRoutes}/${totals.routes}`} />
                <RailStat label="Open seats" value={planningSummary.openSeats} />
                <RailStat label="Dispatch" value={planningSummary.dispatchAssignments} />
                <RailStat label="Schedule" value={planningSummary.scheduleAssignments} />
              </RailSection>

              <RailSection title="Workload Scan">
                <RailStat label="Avg stops / route" value={fmt(planningSummary.avgStops, 1)} />
                <RailStat label="Peak route" value={planningSummary.peakRoute ? routeLabel(planningSummary.peakRoute) : "—"} />
                <RailStat label="Peak stops" value={planningSummary.peakRoute ? fmt(planningSummary.peakRoute.stops) : "—"} />
                <RailStat label="Above avg routes" value={planningSummary.routesAboveAverage} />
              </RailSection>
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

function Metric(props: { label: string; value: string | number }) {
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
      <strong style={{ fontSize: 13 }}>{typeof props.value === "number" ? fmt(props.value) : props.value}</strong>
    </div>
  );
}

function RailSection(props: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ borderTop: "1px solid #e6edf5", paddingTop: 10, display: "grid", gap: 8 }}>
      <p style={{ ...eyebrow, color: "#009b67" }}>{props.title}</p>
      {props.children}
    </section>
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
