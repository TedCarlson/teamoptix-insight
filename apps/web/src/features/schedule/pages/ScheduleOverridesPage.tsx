"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  resolveScheduleOverrideImpact,
  resolveTimeOffRequestImpact,
  type ScheduleCapacityRoute,
  type TimeOffImpactScheduleRow,
  type TimeOffRequestImpact,
} from "@/features/schedule/lib/scheduleCapacity";
import { resignationImpactWindow } from "@/features/schedule/lib/resignationWorkflow";

type OverrideType = "CALL_OUT" | "TIME_OFF" | "ADD_IN" | "ADMIN_OFF" | "RESIGNATION_NOTICE";

type WorkerRow = {
  roster_member_id: string;
  full_name: string;
  worker_type: string | null;
  employment_status: string | null;
};

type ScheduleRowResponse = {
  roster_member_id: string;
  full_name: string;
  role_label: string | null;
  role_bucket: "DRIVER_HELPER" | "OTHER";
  employment_status: string | null;
};

type OverrideRow = {
  id: string;
  roster_member_id: string;
  override_type: OverrideType;
  start_date: string;
  end_date: string;
  manager_note: string | null;
  is_active: boolean;
  created_at: string;
  workflow_status: string | null;
  separation_effective_date: string | null;
  repaint_evidence: Record<string, unknown> | null;
  full_name: string | null;
  worker_type: string | null;
};

type CommitResult = {
  generated_count?: number;
  override_count?: number;
  add_in_insert_count?: number;
};

type TimeOffRequestRow = {
  id: string;
  roster_member_id: string;
  requested_dates: string[];
  start_date: string;
  end_date: string;
  day_count: number;
  status: "PENDING" | "APPROVED" | "DENIED" | "WITHDRAWN";
  request_note: string | null;
  manager_note: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  full_name: string | null;
  worker_type: string | null;
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

const inputStyle: React.CSSProperties = {
  height: 42,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid #d6dfeb",
  background: "#fff",
  minWidth: 180,
};

const cellStyle: React.CSSProperties = {
  padding: "12px",
  borderBottom: "1px solid #e6edf5",
  verticalAlign: "top",
};

function signedDelta(value: number) {
  return value >= 0 ? `+${value}` : String(value);
}

function impactDateLabel(serviceDate: string) {
  return new Date(`${serviceDate}T00:00:00`).toLocaleDateString(
    undefined,
    {
      weekday: "short",
      month: "short",
      day: "numeric",
    }
  );
}

function isoDatesBetween(startDate: string, endDate: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(endDate)
  ) {
    return [];
  }

  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);

  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    end < start
  ) {
    return [];
  }

  const dates: string[] = [];
  const cursor = new Date(start);

  while (cursor <= end && dates.length < 366) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

function TimeOffImpactView({
  impact,
}: {
  impact: TimeOffRequestImpact | null;
}) {
  if (!impact) {
    return <span style={{ color: "#64748b" }}>Impact unavailable</span>;
  }

  return (
    <div style={{ display: "grid", gap: 8, minWidth: 250 }}>
      {impact.days.map((day) => (
        <div
          key={day.serviceDate}
          style={{
            paddingBottom: 8,
            borderBottom: "1px solid #e6edf5",
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 800 }}>
            {impactDateLabel(day.serviceDate)}
          </div>

          {day.affectsSchedule ? (
            <>
              <div
                style={{
                  marginTop: 3,
                  fontSize: 12,
                  color: "#475569",
                }}
              >
                {day.routeDemand} routes ·{" "}
                {day.currentScheduledDrivers} →{" "}
                {day.projectedScheduledDrivers} drivers
              </div>

              <div
                style={{
                  marginTop: 2,
                  fontSize: 12,
                  fontWeight: 800,
                  color:
                    day.projectedDelta < 0
                      ? "#b91c1c"
                      : day.projectedDelta > 5
                        ? "#b91c1c"
                        : day.projectedDelta === 0
                          ? "#92400e"
                          : "#1d4ed8",
                }}
              >
                {signedDelta(day.currentDelta)} →{" "}
                {signedDelta(day.projectedDelta)} · {day.signalLabel}
              </div>
            </>
          ) : (
            <div
              style={{
                marginTop: 3,
                fontSize: 12,
                color: "#64748b",
              }}
            >
              No schedule change · already off
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function ScheduleOverridesPage() {
  const params = useParams();
  const slug = String(params?.slug ?? "");

  const [workers, setWorkers] = useState<WorkerRow[]>([]);
  const [overrides, setOverrides] = useState<OverrideRow[]>([]);
  const [pendingRequests, setPendingRequests] = useState<TimeOffRequestRow[]>([]);
  const [requestHistory, setRequestHistory] = useState<TimeOffRequestRow[]>([]);
  const [impactRoutes, setImpactRoutes] = useState<ScheduleCapacityRoute[]>([]);
  const [impactScheduleRows, setImpactScheduleRows] =
    useState<TimeOffImpactScheduleRow[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [draftImpactRoutes, setDraftImpactRoutes] =
    useState<ScheduleCapacityRoute[]>([]);
  const [draftImpactRows, setDraftImpactRows] =
    useState<TimeOffImpactScheduleRow[]>([]);
  const [draftImpactLoading, setDraftImpactLoading] = useState(false);
  const [draftImpactError, setDraftImpactError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [rosterMemberId, setRosterMemberId] = useState("");
  const [overrideType, setOverrideType] = useState<OverrideType>("CALL_OUT");
  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState(todayIso());
  const [search, setSearch] = useState("");
  const [managerNote, setManagerNote] = useState("");
  const [editingResignationId, setEditingResignationId] = useState<string | null>(null);
  const [editedLastDay, setEditedLastDay] = useState("");

  async function loadWorkers() {
    const res = await fetch(`/api/company/${slug}/schedule`, {
      credentials: "include",
      cache: "no-store",
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data?.error ?? "Failed to load workers.");
    }

    const rows = (data?.rows ?? []) as ScheduleRowResponse[];

    const mapped: WorkerRow[] = rows
      .map((row) => ({
        roster_member_id: row.roster_member_id,
        full_name: row.full_name,
        worker_type: row.role_label ?? null,
        employment_status: row.employment_status,
      }))
      .sort((a, b) => a.full_name.localeCompare(b.full_name));

    setWorkers(mapped);

  }

  async function loadOverrides() {
    const res = await fetch(`/api/company/${slug}/schedule/overrides`, {
      credentials: "include",
      cache: "no-store",
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data?.error ?? "Failed to load overrides.");
    }

    setOverrides((data?.rows ?? []) as OverrideRow[]);
  }

  async function loadTimeOffImpactData(requests: TimeOffRequestRow[]) {
    const requestedDates = Array.from(
      new Set(
        requests.flatMap((request) => request.requested_dates ?? [])
      )
    ).sort();

    if (requestedDates.length === 0) {
      setImpactRoutes([]);
      setImpactScheduleRows([]);
      return;
    }

    const startDate = requestedDates[0];
    const endDate = requestedDates[requestedDates.length - 1];

    const [routesRes, scheduleRes] = await Promise.all([
      fetch(`/api/company/${slug}/routes`, {
        credentials: "include",
        cache: "no-store",
      }),
      fetch(
        `/api/company/${slug}/schedule/generated?start_date=${startDate}&end_date=${endDate}`,
        {
          credentials: "include",
          cache: "no-store",
        }
      ),
    ]);

    const [routesData, scheduleData] = await Promise.all([
      routesRes.json().catch(() => ({})),
      scheduleRes.json().catch(() => ({})),
    ]);

    if (!routesRes.ok) {
      throw new Error(
        routesData?.error ?? "Failed to load route demand for request impact."
      );
    }

    if (!scheduleRes.ok) {
      throw new Error(
        scheduleData?.error ?? "Failed to load projected schedule impact."
      );
    }

    setImpactRoutes(
      Array.isArray(routesData?.routes)
        ? (routesData.routes as ScheduleCapacityRoute[])
        : []
    );

    setImpactScheduleRows(
      Array.isArray(scheduleData?.rows)
        ? (scheduleData.rows as TimeOffImpactScheduleRow[])
        : []
    );
  }

  async function loadTimeOffRequests() {
    const res = await fetch(`/api/company/${slug}/schedule/time-off-requests`, {
      credentials: "include",
      cache: "no-store",
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data?.error ?? "Failed to load time off requests.");
    }

    const pending = (data?.pending ?? []) as TimeOffRequestRow[];
    const history = (data?.history ?? []) as TimeOffRequestRow[];

    setPendingRequests(pending);
    setRequestHistory(history);

    await loadTimeOffImpactData(pending);
  }

  async function refreshAll() {
    setLoading(true);
    setError(null);

    try {
      await Promise.all([loadWorkers(), loadOverrides(), loadTimeOffRequests()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load overrides.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!slug) return;
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  function clearOverrideDraft() {
    const today = todayIso();

    setRosterMemberId("");
    setOverrideType("CALL_OUT");
    setStartDate(today);
    setEndDate(today);
    setManagerNote("");
    setDraftImpactRoutes([]);
    setDraftImpactRows([]);
    setDraftImpactError(null);
    setDraftImpactLoading(false);
  }

  async function handleCreateOverride(e: React.FormEvent) {
    e.preventDefault();

    try {
      setBusy(true);
      setError(null);
      setMessage(null);

      const res = await fetch(`/api/company/${slug}/schedule/overrides`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          roster_member_id: rosterMemberId,
          override_type: overrideType,
          start_date: startDate,
          end_date: endDate,
          manager_note: managerNote,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error ?? "Failed to create override.");
        return;
      }

      const commit = (data?.commit ?? {}) as CommitResult;

      setMessage(
        overrideType === "RESIGNATION_NOTICE"
          ? `Resignation submitted. The loaded schedule repainted immediately, ${Number((data?.commit ?? {})?.future_rows_removed ?? 0)} future rows were removed, and the ${data?.separation_effective_date ?? "LD+1"} separation cascade is scheduled.`
          : `Override saved. Generated ${commit.generated_count ?? 0} rows, applied ${commit.override_count ?? 0} overrides, inserted ${commit.add_in_insert_count ?? 0} add-ins.`
      );

      clearOverrideDraft();
      await refreshAll();
    } catch {
      setError("Failed to create override.");
    } finally {
      setBusy(false);
    }
  }

  async function handleReviewTimeOffRequest(
    requestId: string,
    decision: "APPROVED" | "DENIED"
  ) {
    try {
      setBusy(true);
      setError(null);
      setMessage(null);

      const res = await fetch(
        `/api/company/${slug}/schedule/time-off-requests/${requestId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ decision }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error ?? "Failed to review time off request.");
        return;
      }

      setMessage(
        decision === "APPROVED"
          ? "Time off request approved. Schedule override created and schedule repainted."
          : "Time off request denied."
      );

      await refreshAll();
    } catch {
      setError("Failed to review time off request.");
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateResignation(overrideId: string) {
    try {
      setBusy(true);
      setError(null);
      setMessage(null);
      const res = await fetch(
        `/api/company/${slug}/schedule/overrides/${overrideId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ end_date: editedLastDay }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Failed to change the last scheduled day.");
        return;
      }
      setEditingResignationId(null);
      setEditedLastDay("");
      setMessage(
        `Last scheduled day changed to ${data?.last_scheduled_date ?? editedLastDay}. The schedule and countdown were updated immediately.`
      );
      await refreshAll();
    } catch {
      setError("Failed to change the last scheduled day.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveOverride(
    overrideId: string,
    disposition?: "CANCELLED" | "RESCINDED"
  ) {
    try {
      setBusy(true);
      setError(null);
      setMessage(null);

      const res = await fetch(
        `/api/company/${slug}/schedule/overrides/${overrideId}${disposition ? `?disposition=${disposition}` : ""}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error ?? "Failed to remove override.");
        return;
      }

      const commit = (data?.commit ?? {}) as CommitResult;

      setMessage(
        disposition
          ? `Resignation notice ${disposition.toLowerCase()}. The loaded schedule was restored immediately.`
          : `Override removed. Generated ${commit.generated_count ?? 0} rows, applied ${commit.override_count ?? 0} overrides, inserted ${commit.add_in_insert_count ?? 0} add-ins.`
      );

      await refreshAll();
    } catch {
      setError("Failed to remove override.");
    } finally {
      setBusy(false);
    }
  }

  const filteredOverrides = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return overrides;

    return overrides.filter((row) => {
      return (
        (row.full_name ?? "").toLowerCase().includes(q) ||
        (row.worker_type ?? "").toLowerCase().includes(q) ||
        row.override_type.toLowerCase().includes(q) ||
        row.start_date.toLowerCase().includes(q) ||
        row.end_date.toLowerCase().includes(q) ||
        (row.manager_note ?? "").toLowerCase().includes(q)
      );
    });
  }, [overrides, search]);

  const impactByRequestId = useMemo(() => {
    const map = new Map<string, TimeOffRequestImpact>();

    for (const request of pendingRequests) {
      map.set(
        request.id,
        resolveTimeOffRequestImpact({
          requestedDates: request.requested_dates,
          rosterMemberId: request.roster_member_id,
          routes: impactRoutes,
          scheduleRows: impactScheduleRows,
        })
      );
    }

    return map;
  }, [impactRoutes, impactScheduleRows, pendingRequests]);

  useEffect(() => {
    if (pendingRequests.length === 0) {
      setSelectedRequestId(null);
      return;
    }

    const selectedStillExists = pendingRequests.some(
      (request) => request.id === selectedRequestId
    );

    if (!selectedStillExists) {
      setSelectedRequestId(pendingRequests[0].id);
    }
  }, [pendingRequests, selectedRequestId]);

  const selectedRequest = useMemo(
    () =>
      pendingRequests.find(
        (request) => request.id === selectedRequestId
      ) ?? null,
    [pendingRequests, selectedRequestId]
  );

  const selectedImpact = selectedRequest
    ? impactByRequestId.get(selectedRequest.id) ?? null
    : null;

  const selectedOverrideWorker = useMemo(
    () =>
      workers.find(
        (worker) => worker.roster_member_id === rosterMemberId
      ) ?? null,
    [rosterMemberId, workers]
  );

  const overrideImpactWindow = useMemo(() => {
    if (overrideType !== "RESIGNATION_NOTICE") {
      return { startDate, endDate };
    }
    try {
      return resignationImpactWindow(endDate);
    } catch {
      return { startDate: "", endDate: "" };
    }
  }, [endDate, overrideType, startDate]);

  const stagedOverrideDates = useMemo(
    () => isoDatesBetween(overrideImpactWindow.startDate, overrideImpactWindow.endDate),
    [overrideImpactWindow]
  );

  const hasCompleteOverrideDraft =
    Boolean(selectedOverrideWorker) &&
    stagedOverrideDates.length > 0;

  useEffect(() => {
    let active = true;

    async function loadDraftImpact() {
      if (!hasCompleteOverrideDraft) {
        setDraftImpactRoutes([]);
        setDraftImpactRows([]);
        setDraftImpactError(null);
        setDraftImpactLoading(false);
        return;
      }

      try {
        setDraftImpactLoading(true);
        setDraftImpactError(null);

        const [routesRes, scheduleRes] = await Promise.all([
          fetch(`/api/company/${slug}/routes`, {
            credentials: "include",
            cache: "no-store",
          }),
          fetch(
            `/api/company/${slug}/schedule/generated?start_date=${overrideImpactWindow.startDate}&end_date=${overrideImpactWindow.endDate}`,
            {
              credentials: "include",
              cache: "no-store",
            }
          ),
        ]);

        const [routesData, scheduleData] = await Promise.all([
          routesRes.json().catch(() => ({})),
          scheduleRes.json().catch(() => ({})),
        ]);

        if (!active) return;

        if (!routesRes.ok) {
          throw new Error(
            routesData?.error ?? "Failed to load draft route demand."
          );
        }

        if (!scheduleRes.ok) {
          throw new Error(
            scheduleData?.error ?? "Failed to load draft schedule projection."
          );
        }

        setDraftImpactRoutes(
          Array.isArray(routesData?.routes)
            ? (routesData.routes as ScheduleCapacityRoute[])
            : []
        );

        setDraftImpactRows(
          Array.isArray(scheduleData?.rows)
            ? (scheduleData.rows as TimeOffImpactScheduleRow[])
            : []
        );
      } catch (error) {
        if (!active) return;

        setDraftImpactRoutes([]);
        setDraftImpactRows([]);
        setDraftImpactError(
          error instanceof Error
            ? error.message
            : "Failed to calculate override draft impact."
        );
      } finally {
        if (active) setDraftImpactLoading(false);
      }
    }

    if (slug) void loadDraftImpact();

    return () => {
      active = false;
    };
  }, [
    endDate,
    hasCompleteOverrideDraft,
    rosterMemberId,
    slug,
    startDate,
    overrideImpactWindow,
  ]);

  const stagedOverrideImpact = useMemo(() => {
    if (
      !hasCompleteOverrideDraft ||
      !selectedOverrideWorker ||
      draftImpactLoading ||
      draftImpactError
    ) {
      return null;
    }

    return resolveScheduleOverrideImpact({
      requestedDates: stagedOverrideDates,
      rosterMemberId,
      overrideType,
      routes: draftImpactRoutes,
      scheduleRows: draftImpactRows,
      worker: {
        full_name: selectedOverrideWorker.full_name,
        worker_type: selectedOverrideWorker.worker_type,
        employment_status: selectedOverrideWorker.employment_status,
      },
    });
  }, [
    draftImpactError,
    draftImpactLoading,
    draftImpactRoutes,
    draftImpactRows,
    hasCompleteOverrideDraft,
    overrideType,
    rosterMemberId,
    selectedOverrideWorker,
    stagedOverrideDates,
  ]);

  const activeImpactSource = hasCompleteOverrideDraft
    ? "OVERRIDE_DRAFT"
    : selectedRequest
      ? "PENDING_REQUEST"
      : "EMPTY";

  const activeImpact =
    activeImpactSource === "OVERRIDE_DRAFT"
      ? stagedOverrideImpact
      : selectedImpact;

  return (
    <main className="workspace-shell">
      <section
        style={{
          width: "var(--app-page)",
          margin: "0 auto",
          padding: "24px 0 12px",
          display: "grid",
          gap: 12,
        }}
      >
        <div style={{ display: "grid", gap: 4 }}>
          <p
            className="eyebrow"
            style={{ margin: 0, fontSize: 12, letterSpacing: "0.08em" }}
          >
            Schedule
          </p>
          <h1 style={{ margin: 0, fontSize: 24, lineHeight: 1.05 }}>
            Overrides
          </h1>
        </div>
      </section>

      <section className="value-strip" style={{ paddingTop: 12 }}>
        <div className="value-grid">
          {error ? (
            <article className="value-card" style={{ gridColumn: "1 / -1" }}>
              <p style={{ color: "#c62828", margin: 0 }}>{error}</p>
            </article>
          ) : null}

          {message ? (
            <article className="value-card" style={{ gridColumn: "1 / -1" }}>
              <p style={{ color: "#0f9f6e", margin: 0, fontWeight: 600 }}>
                {message}
              </p>
            </article>
          ) : null}

          <div
            className="schedule-override-review-layout"
            style={{ gridColumn: "1 / -1" }}
          >
            <div className="schedule-override-left-stack">
              <article className="value-card">
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <p className="value-card__eyebrow">Driver requests</p>
                    <h3 className="value-card__title">
                      Pending time off requests
                    </h3>
                  </div>

                  <strong style={{ color: "#d97706" }}>
                    {pendingRequests.length} pending
                  </strong>
                </div>

                {loading ? (
                  <div style={{ padding: "16px 0" }}>Loading requests...</div>
                ) : pendingRequests.length === 0 ? (
                  <div style={{ padding: "16px 0" }}>
                    No pending time off requests.
                  </div>
                ) : (
                  <div
                    className="schedule-history-scroll"
                    style={{ marginTop: 16 }}
                  >
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        minWidth: 820,
                      }}
                    >
                      <thead>
                        <tr>
                          {[
                            "Driver",
                            "Dates",
                            "Days",
                            "Submitted",
                            "Note",
                            "Review",
                          ].map((label) => (
                            <th
                              key={label}
                              style={{
                                textAlign: "left",
                                padding: "10px 12px",
                                borderBottom: "1px solid #d6dfeb",
                                fontSize: 12,
                                letterSpacing: "0.04em",
                                textTransform: "uppercase",
                                color: "#5c6b84",
                              }}
                            >
                              {label}
                            </th>
                          ))}
                        </tr>
                      </thead>

                      <tbody>
                        {pendingRequests.map((row) => {
                          const selected = row.id === selectedRequestId;

                          return (
                            <tr
                              key={row.id}
                              onClick={() => setSelectedRequestId(row.id)}
                              style={{
                                cursor: "pointer",
                                background: selected ? "#eff6ff" : "#fff",
                                boxShadow: selected
                                  ? "inset 3px 0 0 #2563eb"
                                  : "none",
                              }}
                            >
                              <td style={cellStyle}>
                                <div style={{ fontWeight: 700 }}>
                                  {row.full_name ?? "Unknown driver"}
                                </div>
                                <div
                                  style={{
                                    fontSize: 12,
                                    color: "#64748b",
                                    marginTop: 2,
                                  }}
                                >
                                  {row.worker_type ?? "—"}
                                </div>
                              </td>

                              <td style={cellStyle}>
                                {row.start_date} → {row.end_date}
                              </td>

                              <td style={cellStyle}>{row.day_count}</td>

                              <td style={cellStyle}>
                                {new Date(row.submitted_at).toLocaleString()}
                              </td>

                              <td style={cellStyle}>
                                {row.request_note ?? "—"}
                              </td>

                              <td style={cellStyle}>
                                <div
                                  style={{
                                    display: "flex",
                                    gap: 8,
                                    flexWrap: "wrap",
                                  }}
                                >
                                  <button
                                    type="button"
                                    className="button button-primary"
                                    disabled={busy}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void handleReviewTimeOffRequest(
                                        row.id,
                                        "APPROVED"
                                      );
                                    }}
                                  >
                                    Approve
                                  </button>

                                  <button
                                    type="button"
                                    className="button"
                                    disabled={busy}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void handleReviewTimeOffRequest(
                                        row.id,
                                        "DENIED"
                                      );
                                    }}
                                  >
                                    Deny
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </article>

              <article className="value-card">
                <p className="value-card__eyebrow">Create override</p>
                <h3 className="value-card__title">
                  Manager exception entry
                </h3>

                <form
                  onSubmit={handleCreateOverride}
                  style={{
                    marginTop: 14,
                    display: "grid",
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "minmax(190px, 1.2fr) minmax(150px, .8fr) minmax(145px, .7fr) minmax(145px, .7fr)",
                      gap: 12,
                    }}
                  >
                    <select
                      value={rosterMemberId}
                      onChange={(event) =>
                        setRosterMemberId(event.target.value)
                      }
                      style={{ ...inputStyle, width: "100%", minWidth: 0 }}
                      disabled={busy || loading}
                    >
                      <option value="">Select worker...</option>
                      {workers.map((worker) => (
                        <option
                          key={worker.roster_member_id}
                          value={worker.roster_member_id}
                        >
                          {worker.full_name}
                          {worker.worker_type
                            ? ` · ${worker.worker_type}`
                            : ""}
                        </option>
                      ))}
                    </select>

                    <select
                      value={overrideType}
                      onChange={(event) => {
                        const nextType = event.target.value as OverrideType;
                        setOverrideType(nextType);
                        if (nextType === "RESIGNATION_NOTICE") {
                          setStartDate(todayIso());
                          setEndDate((current) => current < todayIso() ? todayIso() : current);
                        }
                      }}
                      style={{ ...inputStyle, width: "100%", minWidth: 0 }}
                      disabled={busy}
                    >
                      <option value="CALL_OUT">CALL_OUT</option>
                      <option value="TIME_OFF">TIME_OFF</option>
                      <option value="ADMIN_OFF">ADMIN_OFF</option>
                      <option value="ADD_IN">ADD_IN</option>
                      <option value="RESIGNATION_NOTICE">RESIGNATION_NOTICE</option>
                    </select>

                    <input
                      type="date"
                      value={startDate}
                      onChange={(event) =>
                        setStartDate(event.target.value)
                      }
                      style={{ ...inputStyle, width: "100%", minWidth: 0 }}
                      disabled={busy || overrideType === "RESIGNATION_NOTICE"}
                      aria-label={overrideType === "RESIGNATION_NOTICE" ? "Notice date" : "Start date"}
                    />

                    <input
                      type="date"
                      value={endDate}
                      onChange={(event) =>
                        setEndDate(event.target.value)
                      }
                      style={{ ...inputStyle, width: "100%", minWidth: 0 }}
                      disabled={busy}
                      min={overrideType === "RESIGNATION_NOTICE" ? todayIso() : undefined}
                      aria-label={overrideType === "RESIGNATION_NOTICE" ? "Last day on schedule" : "End date"}
                    />
                  </div>

                  <textarea
                    value={managerNote}
                    onChange={(event) =>
                      setManagerNote(event.target.value)
                    }
                    placeholder="Manager note / context. Example: Administrative off due to termination, job abandonment, or leadership decision."
                    maxLength={500}
                    disabled={busy}
                    style={{
                      width: "100%",
                      minHeight: 96,
                      padding: "12px",
                      borderRadius: 12,
                      border: "1px solid #d6dfeb",
                      background: "#fff",
                      font: "inherit",
                      resize: "vertical",
                    }}
                  />

                  <div
                    className="cta-row"
                    style={{
                      marginTop: 0,
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <button
                      type="submit"
                      className="button button-primary"
                      disabled={busy || loading || !rosterMemberId}
                    >
                      {busy
                        ? "Submitting..."
                        : overrideType === "RESIGNATION_NOTICE"
                          ? "Submit Resignation + Repaint"
                          : "Save Override + Repaint"}
                    </button>

                    <button
                      type="button"
                      className="button"
                      disabled={
                        busy ||
                        (
                          !rosterMemberId &&
                          overrideType === "CALL_OUT" &&
                          startDate === todayIso() &&
                          endDate === todayIso() &&
                          !managerNote.trim()
                        )
                      }
                      onClick={clearOverrideDraft}
                    >
                      Clear Draft
                    </button>
                  </div>
                </form>
              </article>
            </div>

            <article className="value-card schedule-override-impact-card">
              <div>
                <p className="value-card__eyebrow">
                  Time-off intelligence
                </p>
                <h3 className="value-card__title">
                  Operational impact
                </h3>
              </div>

              {loading || draftImpactLoading ? (
                <div style={{ padding: "18px 0" }}>
                  Calculating schedule impact...
                </div>
              ) : draftImpactError && activeImpactSource === "OVERRIDE_DRAFT" ? (
                <div
                  style={{
                    marginTop: 18,
                    padding: 18,
                    border: "1px solid #fecaca",
                    borderRadius: 12,
                    background: "#fef2f2",
                    color: "#b91c1c",
                  }}
                >
                  {draftImpactError}
                </div>
              ) : activeImpactSource === "EMPTY" ? (
                <div
                  style={{
                    marginTop: 18,
                    padding: 18,
                    border: "1px dashed #cbd5e1",
                    borderRadius: 12,
                    color: "#64748b",
                    lineHeight: 1.5,
                  }}
                >
                  Select a pending request or stage a manager override to
                  review its effect on route coverage and scheduled capacity.
                </div>
              ) : (
                <div style={{ marginTop: 18, display: "grid", gap: 18 }}>
                  <section
                    style={{
                      padding: 14,
                      border: "1px solid #dbe4ef",
                      borderRadius: 12,
                      background: "#f8fafc",
                    }}
                  >
                    <div
                      style={{
                        color: "#2563eb",
                        fontSize: 11,
                        fontWeight: 900,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                      }}
                    >
                      {activeImpactSource === "OVERRIDE_DRAFT"
                        ? "Override draft"
                        : "Pending request"}
                    </div>

                    <div
                      style={{
                        marginTop: 8,
                        fontSize: 16,
                        fontWeight: 800,
                      }}
                    >
                      {activeImpactSource === "OVERRIDE_DRAFT"
                        ? selectedOverrideWorker?.full_name ?? "Unknown worker"
                        : selectedRequest?.full_name ?? "Unknown driver"}
                    </div>

                    <div
                      style={{
                        marginTop: 3,
                        fontSize: 12,
                        color: "#64748b",
                      }}
                    >
                      {activeImpactSource === "OVERRIDE_DRAFT"
                        ? `${selectedOverrideWorker?.worker_type ?? "Worker"} · ${overrideType}`
                        : selectedRequest?.worker_type ?? "Driver"}
                    </div>

                    <div
                      style={{
                        marginTop: 12,
                        fontSize: 13,
                        fontWeight: 700,
                      }}
                    >
                      {activeImpactSource === "OVERRIDE_DRAFT"
                        ? overrideType === "RESIGNATION_NOTICE"
                          ? `Notice ${startDate} · last scheduled day ${endDate} · schedule removed beginning ${overrideImpactWindow.startDate}`
                          : `${startDate} → ${endDate}`
                        : `${selectedRequest?.start_date ?? "—"} → ${
                            selectedRequest?.end_date ?? "—"
                          }`}
                    </div>

                    <div
                      style={{
                        marginTop: 4,
                        fontSize: 12,
                        color: "#64748b",
                      }}
                    >
                      {activeImpactSource === "OVERRIDE_DRAFT"
                        ? `${stagedOverrideDates.length} staged day${
                            stagedOverrideDates.length === 1 ? "" : "s"
                          }`
                        : `${selectedRequest?.day_count ?? 0} requested day${
                            selectedRequest?.day_count === 1 ? "" : "s"
                          }`}
                    </div>

                    {activeImpactSource === "PENDING_REQUEST" &&
                    selectedRequest?.request_note ? (
                      <div
                        style={{
                          marginTop: 12,
                          paddingTop: 12,
                          borderTop: "1px solid #e2e8f0",
                          fontSize: 13,
                          color: "#475569",
                        }}
                      >
                        {selectedRequest.request_note}
                      </div>
                    ) : null}

                    {activeImpactSource === "OVERRIDE_DRAFT" &&
                    managerNote.trim() ? (
                      <div
                        style={{
                          marginTop: 12,
                          paddingTop: 12,
                          borderTop: "1px solid #e2e8f0",
                          fontSize: 13,
                          color: "#475569",
                        }}
                      >
                        {managerNote.trim()}
                      </div>
                    ) : null}
                  </section>

                  <TimeOffImpactView impact={activeImpact} />
                </div>
              )}
            </article>
          </div>

          <article className="value-card" style={{ gridColumn: "1 / -1" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <div>
                <p className="value-card__eyebrow">Override history</p>
                <h3 className="value-card__title">Current exception set</h3>
              </div>

              <input
                type="text"
                placeholder="Search worker, type, date..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={inputStyle}
              />
            </div>

            {loading ? (
              <div style={{ padding: "16px 0" }}>Loading overrides...</div>
            ) : filteredOverrides.length === 0 ? (
              <div style={{ padding: "16px 0" }}>No active overrides.</div>
            ) : (
              <div className="schedule-history-scroll" style={{ marginTop: 16 }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    minWidth: 900,
                  }}
                >
                  <thead>
                    <tr>
                      {[
                        "Worker",
                        "Type",
                        "Start",
                        "End",
                        "Status",
                        "Note",
                        "Created",
                        "Actions",
                      ].map((label) => (
                        <th
                          key={label}
                          style={{
                            textAlign: "left",
                            padding: "10px 12px",
                            borderBottom: "1px solid #d6dfeb",
                            fontSize: 12,
                            letterSpacing: "0.04em",
                            textTransform: "uppercase",
                            color: "#5c6b84",
                          }}
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {filteredOverrides.slice(0, 10).map((row) => (
                      <tr key={row.id}>
                        <td style={cellStyle}>
                          <div style={{ fontWeight: 700 }}>
                            {row.full_name ?? "Unknown worker"}
                          </div>
                          <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                            {row.worker_type ?? "—"}
                          </div>
                        </td>
                        <td style={cellStyle}>{row.override_type}</td>
                        <td style={cellStyle}>{row.start_date}</td>
                        <td style={cellStyle}>{row.end_date}</td>
                        <td style={cellStyle}>{row.workflow_status ?? "Active"}</td>
                        <td style={cellStyle}>{row.manager_note ?? "—"}</td>
                        <td style={cellStyle}>
                          {new Date(row.created_at).toLocaleString()}
                        </td>
                        <td style={cellStyle}>
                          {row.override_type === "RESIGNATION_NOTICE" &&
                          row.workflow_status === "COUNTDOWN_ACTIVE" ? (
                            <div style={{ display: "grid", gap: 8, minWidth: 180 }}>
                              {editingResignationId === row.id ? (
                                <div style={{ display: "flex", gap: 6 }}>
                                  <input
                                    type="date"
                                    min={todayIso()}
                                    value={editedLastDay}
                                    onChange={(event) => setEditedLastDay(event.target.value)}
                                    aria-label="Revised last day on schedule"
                                    style={{ ...inputStyle, minWidth: 130, width: 150 }}
                                  />
                                  <button
                                    type="button"
                                    className="button button-primary"
                                    disabled={busy || !editedLastDay}
                                    onClick={() => void handleUpdateResignation(row.id)}
                                  >
                                    Apply
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  className="button"
                                  disabled={busy}
                                  onClick={() => {
                                    setEditingResignationId(row.id);
                                    setEditedLastDay(row.end_date);
                                  }}
                                >
                                  Change last day
                                </button>
                              )}
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                <button
                                  type="button"
                                  className="button"
                                  disabled={busy}
                                  onClick={() => void handleRemoveOverride(row.id, "RESCINDED")}
                                >
                                  Rescinded
                                </button>
                                <button
                                  type="button"
                                  className="button"
                                  disabled={busy}
                                  onClick={() => void handleRemoveOverride(row.id, "CANCELLED")}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : row.override_type === "RESIGNATION_NOTICE" ? (
                            <span style={{ color: "#64748b", fontSize: 12 }}>
                              {row.workflow_status === "COMPLETED"
                                ? "Workflow complete"
                                : "Automated processing"}
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="button"
                              disabled={busy}
                              onClick={() => void handleRemoveOverride(row.id)}
                            >
                              Remove
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="schedule-history-footer">
                  Showing {Math.min(filteredOverrides.length, 10)} of {filteredOverrides.length} active overrides
                </div>
              </div>
            )}
          </article>

          <article className="value-card" style={{ gridColumn: "1 / -1" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <div>
                <p className="value-card__eyebrow">Request history</p>
                <h3 className="value-card__title">Reviewed driver requests</h3>
              </div>
              <span style={{ color: "#64748b", fontWeight: 700 }}>{requestHistory.length} records</span>
            </div>

            {loading ? (
              <div style={{ padding: "16px 0" }}>Loading history...</div>
            ) : requestHistory.length === 0 ? (
              <div style={{ padding: "16px 0" }}>No reviewed requests yet.</div>
            ) : (
              <div style={{ marginTop: 16, overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 920 }}>
                  <thead>
                    <tr>
                      {["Driver", "Dates", "Status", "Submitted", "Reviewed", "Manager note"].map((label) => (
                        <th
                          key={label}
                          style={{
                            textAlign: "left",
                            padding: "10px 12px",
                            borderBottom: "1px solid #d6dfeb",
                            fontSize: 12,
                            letterSpacing: "0.04em",
                            textTransform: "uppercase",
                            color: "#5c6b84",
                          }}
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {requestHistory.slice(0, 10).map((row) => (
                      <tr key={row.id}>
                        <td style={cellStyle}>
                          <div style={{ fontWeight: 700 }}>{row.full_name ?? "Unknown driver"}</div>
                          <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{row.worker_type ?? "—"}</div>
                        </td>
                        <td style={cellStyle}>{row.start_date} → {row.end_date}</td>
                        <td style={cellStyle}>{row.status}</td>
                        <td style={cellStyle}>{new Date(row.submitted_at).toLocaleString()}</td>
                        <td style={cellStyle}>{row.reviewed_at ? new Date(row.reviewed_at).toLocaleString() : "—"}</td>
                        <td style={cellStyle}>{row.manager_note ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>

        </div>
      </section>
    </main>
  );
}
