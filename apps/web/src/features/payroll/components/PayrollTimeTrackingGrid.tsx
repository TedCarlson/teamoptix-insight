"use client";

import { useEffect, useMemo, useState } from "react";
import PayrollWeekControls from "@/features/payroll/components/PayrollWeekControls";
import {
  formatClockTime,
  formatDuration,
  stateLabel,
  summarizeTimeKeepingRows,
  type PayrollTimeKeepingRow,
} from "@/features/payroll/lib/payroll.timekeeping";

type TimeTrackingView = "overview" | "time-sheet" | "duty-hours" | "dot-hours";

type PayrollTimeTrackingGridProps = {
  slug: string;
  weekEnd: string;
  setWeekEnd: (value: string) => void;
};

const thStyle = {
  position: "sticky" as const,
  top: 0,
  background: "#f8fafc",
  borderBottom: "1px solid #e6edf5",
  padding: "9px 10px",
  color: "#64748b",
  fontSize: 11,
  fontWeight: 950,
  textTransform: "uppercase" as const,
  letterSpacing: "0.05em",
  textAlign: "left" as const,
};

const tdStyle = {
  borderBottom: "1px solid #eef2f7",
  padding: "9px 10px",
  color: "#334155",
  fontSize: 13,
};

function TimeTrackingEmptyState({ title }: { title: string }) {
  return (
    <div style={{ border: "1px solid #e6edf5", borderRadius: 14, padding: 12, color: "#64748b", fontWeight: 800 }}>
      {title}
    </div>
  );
}

export default function PayrollTimeTrackingGrid({
  slug,
  weekEnd,
  setWeekEnd,
}: PayrollTimeTrackingGridProps) {
  const [view, setView] = useState<TimeTrackingView>("overview");
  const [rows, setRows] = useState<PayrollTimeKeepingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const summary = useMemo(() => summarizeTimeKeepingRows(rows), [rows]);

  useEffect(() => {
    let active = true;

    async function loadTimeTracking() {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(
          `/api/company/${slug}/payroll/time-keeping?weekEnd=${weekEnd}`,
          {
            credentials: "include",
            cache: "no-store",
          }
        );

        const data = await res.json().catch(() => ({}));

        if (!active) return;

        if (!res.ok) {
          setRows([]);
          setError(data?.error ?? "Failed to load time tracking.");
          return;
        }

        setRows(Array.isArray(data?.rows) ? data.rows : []);
      } catch {
        if (!active) return;
        setRows([]);
        setError("Failed to load time tracking.");
      } finally {
        if (active) setLoading(false);
      }
    }

    if (slug && weekEnd) void loadTimeTracking();

    return () => {
      active = false;
    };
  }, [slug, weekEnd]);

  const title =
    view === "overview"
      ? "Overview"
      : view === "time-sheet"
        ? "Time Sheet"
        : view === "duty-hours"
          ? "Duty Hours"
          : "DOT Hours";

  return (
    <section className="payroll-workspace">
      <div className="payroll-workspace-toolbar">
        <div>
          <p className="value-card__eyebrow">Time Tracking</p>
          <h2 className="app-card__title">{title}</h2>
        </div>

        <div className="payroll-workspace-toolbar__actions">
          <div className="workspace-view-picker">
            <span>View</span>
            <select
              className="workspace-select"
              value={view}
              onChange={(event) => setView(event.target.value as TimeTrackingView)}
            >
              <option value="overview">Overview</option>
              <option value="time-sheet">Time Sheet</option>
              <option value="duty-hours">Duty Hours</option>
              <option value="dot-hours">DOT Hours</option>
            </select>
          </div>

          <PayrollWeekControls
            weekEnd={weekEnd}
            setWeekEnd={setWeekEnd}
            rebuilding={false}
            onRebuild={() => undefined}
          />
        </div>
      </div>

      <div
        style={{
          border: "1px solid #e6edf5",
          borderRadius: 14,
          padding: 10,
          background: "#f8fafc",
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          color: "#334155",
          fontSize: 13,
          fontWeight: 850,
        }}
      >
        <span>{rows.length} records</span>
        <span>
          {summary.activeSessions} active · {summary.closedSessions} closed · {summary.missingClockOut} missing clock out
        </span>
      </div>

      {error ? (
        <div style={{ color: "#991b1b", fontWeight: 800 }}>{error}</div>
      ) : null}

      {loading ? (
        <div className="muted">Loading time tracking...</div>
      ) : view === "duty-hours" ? (
        <TimeTrackingEmptyState title="Duty hour reconciliation is not connected yet." />
      ) : view === "dot-hours" ? (
        <TimeTrackingEmptyState title="DOT hour review is not connected yet." />
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 920 }}>
            <thead>
              <tr>
                <th style={thStyle}>Driver</th>
                <th style={thStyle}>Type</th>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Clock In</th>
                <th style={thStyle}>Clock Out</th>
                <th style={thStyle}>Duration</th>
                <th style={thStyle}>State</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Events</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: 16, color: "#64748b", fontWeight: 800 }}>
                    No clock activity found for this week.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={`${row.roster_member_id}-${row.service_date}`}>
                    <td style={tdStyle}><strong>{row.full_name ?? "Unknown driver"}</strong></td>
                    <td style={tdStyle}>{row.worker_type ?? "—"}</td>
                    <td style={tdStyle}>{row.service_date}</td>
                    <td style={tdStyle}>{formatClockTime(row.clock_in)}</td>
                    <td style={tdStyle}>{formatClockTime(row.clock_out)}</td>
                    <td style={tdStyle}>{formatDuration(row.clock_in, row.clock_out)}</td>
                    <td style={tdStyle}>{stateLabel(row.state)}</td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>{row.event_count}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
