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
import {
  formatOperationalDate,
  planningFrameLabel,
  resolvePlanningFrame,
  getDroCandidateOrder,
  summarizeServiceCompletion,
  type DswCurrentPayload,
} from "../lib/planning-frame";
import {
  buildHistoryByRouteKey,
  buildPlanningIntelligence,
  buildRouteDemandSignal,
  routeLookupKeys,
} from "../lib/planning-intelligence";

type Props = { slug: string; todayDate?: string };

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

type RouteHistoryRow = {
  service_date?: string | null;
  route_baseline_id?: string | null;
  route_name?: string | null;
  wa_number?: string | null;
  actual_delivery_stops?: number | string | null;
  actual_delivery_packages?: number | string | null;
  miles?: number | string | null;
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
  return routeLookupKeys(row);
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

export default function PlanningPage({ slug, todayDate: providedTodayDate }: Props) {
  const todayDate = providedTodayDate ?? todayNyIso();
  const planningDate = addDaysIso(todayDate, 1);

  const [uploadOverlayOpen, setUploadOverlayOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string>(() => new Date().toISOString());
  const [payload, setPayload] = useState<DroPayload | null>(null);
  const [dswPayload, setDswPayload] = useState<DswCurrentPayload | null>(null);
  const [routeSortKey, setRouteSortKey] = useState<"route_name" | "current_wa_num">("route_name");
  const [assignmentsByRouteKey, setAssignmentsByRouteKey] = useState<Record<string, PlanningAssignment>>({});
  const [routeHistoryRows, setRouteHistoryRows] = useState<RouteHistoryRow[]>([]);
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

        const candidates = getDroCandidateOrder({ todayDate, planningDate });

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

    async function loadServiceSnapshot() {
      try {
        const res = await fetch(`/api/company/${slug}/operations/reports/dsw-current?date=${todayDate}`, {
          credentials: "include",
          cache: "no-store",
        });

        const data = await res.json().catch(() => ({}));

        if (!active) return;

        setDswPayload(res.ok ? data : null);
      } catch {
        if (active) setDswPayload(null);
      }
    }

    if (slug && todayDate) void loadServiceSnapshot();

    return () => {
      active = false;
    };
  }, [refreshKey, slug, todayDate]);

  const serviceCompletionPct = useMemo(() => {
    return summarizeServiceCompletion(dswPayload?.rows ?? []);
  }, [dswPayload?.rows]);

  const planningFrame = useMemo(() => {
    return resolvePlanningFrame({
      todayDate,
      planningDate,
      activeDroDate: payload?.source_date ?? null,
      activeDroFrame: payload?.source_frame ?? null,
      serviceCompletionPct,
    });
  }, [payload?.source_date, payload?.source_frame, planningDate, serviceCompletionPct, todayDate]);

  const operationalDate = planningFrame.operationalDate;


  useEffect(() => {
    let active = true;

    async function loadAssignments() {
      try {
        const [scheduleRes, dispatchRes] = await Promise.all([
          fetch(`/api/company/${slug}/schedule/generated?date=${operationalDate}`, {
            credentials: "include",
            cache: "no-store",
          }),
          fetch(`/api/company/${slug}/dispatch/day?date=${operationalDate}`, {
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
            if (row.service_date !== operationalDate || !row.planned_on) continue;
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

    if (slug && operationalDate) void loadAssignments();

    return () => {
      active = false;
    };
  }, [operationalDate, refreshKey, slug]);


  const historyDates = useMemo(() => {
    return Array.from({ length: 14 }, (_, index) =>
      addDaysIso(operationalDate, -7 * (index + 1))
    );
  }, [operationalDate]);

  useEffect(() => {
    let active = true;

    async function loadRouteHistory() {
      try {
        const params = new URLSearchParams();
        for (const date of historyDates) {
          params.append("date", date);
        }

        const res = await fetch(
          `/api/company/${slug}/operations/intelligence/route-history?${params.toString()}`,
          { credentials: "include", cache: "no-store" }
        );

        const data = await res.json().catch(() => ({}));

        if (!active) return;

        if (!res.ok) {
          setRouteHistoryRows([]);
          return;
        }

        setRouteHistoryRows(Array.isArray(data?.rows) ? data.rows : []);
      } catch {
        if (active) setRouteHistoryRows([]);
      }
    }

    if (slug && historyDates.length) void loadRouteHistory();

    return () => {
      active = false;
    };
  }, [historyDates, refreshKey, slug]);

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

  const historyByRouteKey = useMemo(
    () => buildHistoryByRouteKey(routeHistoryRows),
    [routeHistoryRows]
  );

  const routeIntelligenceForRow = useCallback(
    (row: DroPlanRow | null) =>
      buildRouteDemandSignal({
        row,
        historyByRouteKey,
      }),
    [historyByRouteKey]
  );

  const routeSignals = useMemo(
    () => rows.map((row) => routeIntelligenceForRow(row)),
    [routeIntelligenceForRow, rows]
  );

  const planningSummary = useMemo(
    () =>
      buildPlanningIntelligence({
        rows,
        routeSignals,
        assignmentForRow,
        planningFrame: planningFrame.frame,
      }),
    [assignmentForRow, planningFrame.frame, routeSignals, rows]
  );


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
            className="operations-planning-layout"
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) 320px",
              gap: 12,
              marginTop: 10,
              alignItems: "start",
            }}
          >
            <section className="operations-planning-main" style={{ ...panel, padding: 14, display: "grid", gap: 10 }}>
              <div className="operations-planning-header" style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <p style={eyebrow}>{planningFrameLabel(planningFrame.frame)}</p>
                  <h2 style={{ margin: 0, fontSize: 18 }}>Planning snapshot</h2>
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
                <strong style={{ fontSize: 15 }}>{planningSummary.intelligenceLabel}</strong>
                <span style={{ color: "#64748b", fontSize: 12, fontWeight: 850 }}>
                  {planningSummary.intelligenceDetail}
                </span>
              </section>

              <div className="operations-planning-row-list" style={{ display: "grid", gap: 8 }}>
                {rows.map((row, index) => {
                  const key =
                    row.route_baseline_id ??
                    row.wa_number ??
                    row.route_name ??
                    `dro-row-${index}`;

                  const intelligence = routeIntelligenceForRow(row);
                  const rowStyle = planningRowStyle(intelligence.status, false);

                  return (
                    <div
                      key={key}
                      className="operations-planning-row"
                                                                  style={{
                        width: "100%",
                        display: "grid",
                        gridTemplateColumns: "minmax(160px, 0.9fr) minmax(260px, 1.45fr) minmax(145px, 0.7fr) minmax(160px, 0.75fr)",
                        gap: 10,
                        alignItems: "center",
                        padding: "10px 12px",
                        borderRadius: 14,
                        border: rowStyle.border,
                        background: rowStyle.background,
                        textAlign: "left",
                                              }}
                    >
                      <div className="operations-planning-row__identity" style={{ minWidth: 0 }}>
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
                        className="operations-planning-row__assignment"
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

                      <RouteIntelligenceCell signal={intelligence} />
                    </div>
                  );
                })}

                {rows.length === 0 ? (
                  <div style={{ padding: 14, color: "#64748b", fontWeight: 850 }}>
                    No DRO rows loaded for {payload?.source_date ?? operationalDate}.
                  </div>
                ) : null}
              </div>
            </section>

            <aside className="operations-planning-aside" style={{ ...panel, padding: 14, display: "grid", gap: 10 }}>
              <div>
                <p style={eyebrow}>Planning Readiness</p>
                <strong>{planningSummary.readinessLabel}</strong>
                <p style={{ margin: "5px 0 0", color: "#64748b", fontSize: 12, fontWeight: 850 }}>
                  Operational Date · {formatOperationalDate(operationalDate)}
                </p>
                <p style={{ margin: "3px 0 0", color: "#64748b", fontSize: 12, fontWeight: 850 }}>
                  Planning Session · {planningFrame.planningSessionDate ?? "—"} {planningFrame.planningSessionFrame ?? ""}
                </p>
                <p style={{ margin: "3px 0 0", color: "#94a3b8", fontSize: 11, fontWeight: 800 }}>
                  Service Completion · {serviceCompletionPct === null ? "No signal" : `${serviceCompletionPct}%`}
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


function planningRowStyle(
  status: RouteIntelligenceSignal["status"],
  selected: boolean,
) {
  if (selected) {
    return {
      background: "#eff6ff",
      border: "1px solid #93c5fd",
    };
  }

  switch (status) {
    case "HEAVY":
      return {
        background: "#fff7ed",
        border: "1px solid #fdba74",
      };

    case "SHIFTED":
      return {
        background: "#fffbeb",
        border: "1px solid #fcd34d",
      };

    case "LIGHT":
      return {
        background: "#f0f9ff",
        border: "1px solid #7dd3fc",
      };

    case "LIMITED":
      return {
        background: "#f8fafc",
        border: "1px solid #cbd5e1",
      };

    default:
      return {
        background: "#ffffff",
        border: "1px solid #e6edf5",
      };
  }
}


function RouteIntelligenceCell(props: {
  signal: RouteIntelligenceSignal;
}) {
  const { signal } = props;

  return (
    <div
      className="operations-planning-row__intelligence"
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
      <strong style={{ color: signal.tone, fontSize: 13 }}>{signal.label}</strong>
      <span>{signal.detail}</span>
    </div>
  );
}

type RouteIntelligenceSignal = {
  label: string;
  detail: string;
  tone: string;
  deltaPct: number;
  sampleSize: number;
  status: "NO_ROUTE" | "LIMITED" | "HEAVY" | "LIGHT" | "SHIFTED" | "NORMAL";
};

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
      className="operations-planning-row__signal"
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
