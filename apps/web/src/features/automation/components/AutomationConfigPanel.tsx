"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

type AutomationConfigPanelProps = {
  slug: string;
  canEdit: boolean;
};

type AutomationStatusValue =
  | "NOT_CONFIGURED"
  | "CONFIGURED"
  | "HEALTHY"
  | "WARNING"
  | "ACTION_REQUIRED"
  | "DISABLED";

type AutomationStatusResponse = {
  provider_key: "FEDEX";
  status: AutomationStatusValue;
  profile_id: string;
  updated_at: string;
};

type CredentialResponse = {
  username: string;
  has_secret: boolean;
  last_verified_at: string | null;
  last_verification_result: string | null;
};

type AutomationRun = {
  id: string;
  automation_type: string;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  status: string;
  inserted_rows: number | null;
  matched_rows: number | null;
  unmatched_rows: number | null;
  batch_id: string | null;
  error_message: string | null;
};

type ScheduleRow = {
  id: string;
  company_id: string;
  company_slug: string;
  automation_type: "DSW" | "FCC" | "DRO_AM" | "DRO_PM" | string;
  is_enabled: boolean;
  cadence_minutes: number;
  window_preset: "SORT_DELIVERY_DAY" | "BUSINESS_DAY" | "OFF" | string;
  start_time: string;
  end_time: string;
  min_cooldown_minutes: number;
  created_at: string;
  updated_at: string;
};

function SectionCard(props: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <article className="app-card" style={{ padding: 14 }}>
      <p className="value-card__eyebrow">{props.eyebrow}</p>
      <h3 className="app-card__title" style={{ fontSize: 18 }}>{props.title}</h3>
      <div style={{ marginTop: 10 }}>{props.children}</div>
    </article>
  );
}

function MiniStat(props: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="context-stat" style={{ padding: "9px 10px" }}>
      <span className="context-stat__label">{props.label}</span>
      <strong>{props.value ?? "—"}</strong>
    </div>
  );
}

function formatStatus(value: AutomationStatusValue | null) {
  if (!value) return "Loading...";
  return value
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

function formatTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatDuration(ms: number | null | undefined) {
  if (!ms && ms !== 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${Math.round(ms / 1000)}s`;
}

function formatWindow(row: ScheduleRow | null | undefined) {
  if (!row) return "—";
  if (row.window_preset === "OFF") return "Off";
  return `${row.start_time.slice(0, 5)} → ${row.end_time.slice(0, 5)}`;
}

function scheduleLabel(value: string) {
  if (value === "SORT_DELIVERY_DAY") return "Sort Delivery Day";
  if (value === "BUSINESS_DAY") return "Business Day";
  if (value === "OFF") return "Off";
  return value;
}

function RunSummary(props: { title: string; run: AutomationRun | null }) {
  return (
    <div style={sourceBox}>
      <strong style={sourceTitle}>{props.title}</strong>
      <div style={summaryLine}>
        <span style={summaryLabel}>Last Run</span>
        <strong>{formatTime(props.run?.started_at)}</strong>
      </div>
      <div style={summaryLine}>
        <span style={summaryLabel}>Status</span>
        <strong>{props.run?.status ?? "—"}</strong>
      </div>
      <div style={summaryLine}>
        <span style={summaryLabel}>Duration</span>
        <strong>{formatDuration(props.run?.duration_ms)}</strong>
      </div>
      <div style={summaryLine}>
        <span style={summaryLabel}>Rows</span>
        <strong>{props.run?.inserted_rows ?? "—"}</strong>
      </div>
      <div style={summaryLine}>
        <span style={summaryLabel}>Match</span>
        <strong>
          {props.run?.matched_rows ?? "—"} / {props.run?.unmatched_rows ?? "—"}
        </strong>
      </div>
    </div>
  );
}

function OptionButton(props: {
  active: boolean;
  disabled: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={props.onClick}
      style={{
        border: props.active ? "1px solid #2563eb" : "1px solid #d6dfeb",
        background: props.active ? "#eff6ff" : "#fff",
        color: props.active ? "#1d4ed8" : "#334155",
        borderRadius: 999,
        minHeight: 34,
        padding: "0 12px",
        fontSize: 12,
        fontWeight: 900,
        cursor: props.disabled ? "not-allowed" : "pointer",
      }}
    >
      {props.children}
    </button>
  );
}

function ScheduleEditor(props: {
  row: ScheduleRow;
  disabled: boolean;
  saving: boolean;
  onChange: (row: ScheduleRow) => void;
  onSave: (row: ScheduleRow) => void;
}) {
  const enabled = props.row.is_enabled && props.row.window_preset !== "OFF";

  return (
    <div
      style={{
        border: "1px solid #dbe7f3",
        borderRadius: 16,
        padding: 12,
        background: "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)",
        display: "grid",
        gap: 10,
        boxShadow: "0 10px 28px rgba(15, 23, 42, 0.04)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <div>
          <p className="value-card__eyebrow" style={{ margin: 0 }}>
            Automation
          </p>
          <h3 className="app-card__title" style={{ margin: "2px 0 0", fontSize: 18 }}>
            {props.row.automation_type}
          </h3>
        </div>

        <button
          type="button"
          disabled={props.disabled}
          onClick={() =>
            props.onChange({
              ...props.row,
              is_enabled: !enabled,
              window_preset: !enabled && props.row.window_preset === "OFF" ? "SORT_DELIVERY_DAY" : props.row.window_preset,
            })
          }
          style={{
            border: enabled ? "1px solid #86efac" : "1px solid #d6dfeb",
            background: enabled ? "#f0fdf4" : "#f8fafc",
            color: enabled ? "#166534" : "#64748b",
            borderRadius: 999,
            minHeight: 32,
            padding: "0 12px",
            fontSize: 12,
            fontWeight: 950,
            cursor: props.disabled ? "not-allowed" : "pointer",
          }}
        >
          {enabled ? "Enabled" : "Disabled"}
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "0.8fr 1.2fr", gap: 10 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <span style={summaryLabel}>Cadence</span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[15, 30, 60].map((minutes) => (
            <OptionButton
              key={minutes}
              active={props.row.cadence_minutes === minutes}
              disabled={props.disabled}
              onClick={() => props.onChange({ ...props.row, cadence_minutes: minutes })}
            >
              {minutes === 60 ? "Hourly" : `${minutes} min`}
            </OptionButton>
          ))}
          </div>
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          <span style={summaryLabel}>Run Window</span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[
            ["SORT_DELIVERY_DAY", "Sort + Delivery"],
            ["BUSINESS_DAY", "Business Day"],
            ["OFF", "Off"],
          ].map(([value, label]) => (
            <OptionButton
              key={value}
              active={props.row.window_preset === value}
              disabled={props.disabled}
              onClick={() =>
                props.onChange({
                  ...props.row,
                  window_preset: value,
                  is_enabled: value === "OFF" ? false : props.row.is_enabled,
                })
              }
            >
              {label}
            </OptionButton>
          ))}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
        <label style={timeBox}>
          <span style={summaryLabel}>Start</span>
          <input
            type="time"
            value={props.row.start_time.slice(0, 5)}
            disabled={props.disabled}
            onChange={(event) =>
              props.onChange({
                ...props.row,
                start_time: `${event.target.value}:00`,
              })
            }
            style={timeInput}
          />
        </label>

        <label style={timeBox}>
          <span style={summaryLabel}>End</span>
          <input
            type="time"
            value={props.row.end_time.slice(0, 5)}
            disabled={props.disabled}
            onChange={(event) =>
              props.onChange({
                ...props.row,
                end_time: `${event.target.value}:00`,
              })
            }
            style={timeInput}
          />
        </label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
        <MiniStat label="Window" value={formatWindow(props.row)} />
        <MiniStat label="Cooldown" value={`${props.row.min_cooldown_minutes} min`} />
        <MiniStat label="State" value={enabled ? "Active" : "Paused"} />
      </div>

      <button
        type="button"
        className="button button-primary"
        disabled={props.disabled || props.saving}
        onClick={() => props.onSave(props.row)}
        style={{ minHeight: 36 }}
      >
        {props.saving ? "Saving..." : "Save"}
      </button>
    </div>
  );
}

export default function AutomationConfigPanel(props: AutomationConfigPanelProps) {
  const [status, setStatus] = useState<AutomationStatusResponse | null>(null);
  const [credential, setCredential] = useState<CredentialResponse | null>(null);
  const [scheduleRows, setScheduleRows] = useState<ScheduleRow[]>([]);
  const [runs, setRuns] = useState<AutomationRun[]>([]);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [savingScheduleKey, setSavingScheduleKey] = useState<string | null>(null);

  const [message, setMessage] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    const res = await fetch(`/api/company/${props.slug}/automation/status`, {
      cache: "no-store",
      credentials: "include",
    });

    const data = await res.json();

    if (!res.ok) throw new Error(data?.error ?? "Failed to load status.");

    setStatus(data);
  }, [props.slug]);

  const loadCredential = useCallback(async () => {
    const res = await fetch(`/api/company/${props.slug}/automation/credentials`, {
      cache: "no-store",
      credentials: "include",
    });

    const data = await res.json();

    if (!res.ok) throw new Error(data?.error ?? "Failed to load credentials.");

    setCredential(data);
    setUsername(data?.username ?? "");
  }, [props.slug]);

  const loadSchedule = useCallback(async () => {
    const res = await fetch(`/api/company/${props.slug}/automation/schedule`, {
      cache: "no-store",
      credentials: "include",
    });

    const data = await res.json();

    if (!res.ok) throw new Error(data?.error ?? "Failed to load schedule.");

    setScheduleRows(Array.isArray(data?.rows) ? data.rows : []);
  }, [props.slug]);

  const loadRuns = useCallback(async () => {
    const res = await fetch(`/api/company/${props.slug}/automation/runs?limit=20`, {
      cache: "no-store",
      credentials: "include",
    });

    const data = await res.json();

    if (!res.ok) throw new Error(data?.error ?? "Failed to load runs.");

    setRuns(Array.isArray(data?.rows) ? data.rows : []);
  }, [props.slug]);

  const loadAll = useCallback(async () => {
    await Promise.all([loadStatus(), loadCredential(), loadSchedule(), loadRuns()]);
  }, [loadStatus, loadCredential, loadSchedule, loadRuns]);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setStatusError(null);
        await loadAll();
      } catch (error) {
        if (!active) return;
        setStatusError(error instanceof Error ? error.message : "Failed to load automation.");
      }
    }

    if (props.slug) void load();

    return () => {
      active = false;
    };
  }, [props.slug, loadAll]);

  const latestDswRun = useMemo(() => runs.find((run) => run.automation_type === "DSW") ?? null, [runs]);
  const latestFccRun = useMemo(() => runs.find((run) => run.automation_type === "FCC") ?? null, [runs]);
  const successCount = runs.filter((run) => run.status === "SUCCESS").length;
  const failedCount = runs.filter((run) => run.status === "FAILED").length;
  const enabledCount = scheduleRows.filter((row) => row.is_enabled && row.window_preset !== "OFF").length;
  const nextRunLabel =
    enabledCount > 0
      ? scheduleRows
          .filter((row) => row.is_enabled && row.window_preset !== "OFF")
          .map((row) => `${row.automation_type}: ${row.cadence_minutes}m`)
          .join(" · ")
      : "Not scheduled";

  async function saveCredential() {
    try {
      setSaving(true);
      setMessage(null);
      setStatusError(null);

      const res = await fetch(`/api/company/${props.slug}/automation/credentials`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data?.error ?? "Failed to save credentials.");

      setPassword("");
      await Promise.all([loadCredential(), loadStatus()]);
      setMessage("Credentials saved.");
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : "Failed to save credentials.");
    } finally {
      setSaving(false);
    }
  }

  async function verifyCredential() {
    try {
      setVerifying(true);
      setMessage(null);
      setStatusError(null);

      const res = await fetch(`/api/company/${props.slug}/automation/verify`, {
        method: "POST",
        credentials: "include",
      });

      const data = await res.json();

      await Promise.all([loadCredential(), loadStatus()]);

      if (!res.ok) throw new Error(data?.message ?? data?.error ?? "Verification failed.");

      setMessage(data?.message ?? "Credentials verified.");
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : "Verification failed.");
    } finally {
      setVerifying(false);
    }
  }

  async function saveSchedule(row: ScheduleRow) {
    try {
      setSavingScheduleKey(row.automation_type);
      setMessage(null);
      setStatusError(null);

      const res = await fetch(`/api/company/${props.slug}/automation/schedule`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          automation_type: row.automation_type,
          is_enabled: row.window_preset === "OFF" ? false : row.is_enabled,
          cadence_minutes: row.cadence_minutes,
          window_preset: row.window_preset,
          start_time: row.start_time,
          end_time: row.end_time,
        }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data?.error ?? "Failed to save schedule.");

      await loadSchedule();
      setMessage(`${row.automation_type} schedule saved.`);
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : "Failed to save schedule.");
    } finally {
      setSavingScheduleKey(null);
    }
  }

  function updateScheduleRow(next: ScheduleRow) {
    setScheduleRows((current) =>
      current.map((row) =>
        row.id === next.id || row.automation_type === next.automation_type
          ? next
          : row
      )
    );
  }

  const scheduleRowsToShow = scheduleRows.filter((row) => ["DSW", "FCC"].includes(row.automation_type));

  return (
    <section style={{ display: "grid", gap: 10 }}>
      <SectionCard eyebrow="Automation status" title="Data acquisition health">
        <div style={grid4}>
          <MiniStat label="Status" value={statusError ? "Warning" : formatStatus(status?.status ?? null)} />
          <MiniStat label="Last DSW" value={formatTime(latestDswRun?.started_at)} />
          <MiniStat label="Last FCC" value={formatTime(latestFccRun?.started_at)} />
          <MiniStat label="Next Run" value={nextRunLabel} />
        </div>
      </SectionCard>

      <SectionCard eyebrow="Credential vault" title="FedEx credentials">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="FedEx username"
            disabled={!props.canEdit}
          />

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="FedEx password"
            disabled={!props.canEdit}
          />
        </div>

        <div className="cta-row" style={{ marginTop: 12 }}>
          <button
            type="button"
            className="button button-primary"
            disabled={!props.canEdit || saving || !username.trim() || !password.trim()}
            onClick={saveCredential}
          >
            {saving ? "Saving..." : "Save Credentials"}
          </button>

          <button
            type="button"
            className="button"
            disabled={!props.canEdit || verifying || !credential?.has_secret}
            onClick={verifyCredential}
          >
            {verifying ? "Verifying..." : "Test Connection"}
          </button>
        </div>

        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
          <MiniStat label="Credential Status" value={credential?.has_secret ? "Configured" : "Not Configured"} />
          <MiniStat label="Last Verified" value={formatDateTime(credential?.last_verified_at)} />
          <MiniStat label="Access Scope" value="DSW / FCC Required" />
        </div>

        {message ? <p style={{ color: "#0f9f6e", fontWeight: 800 }}>{message}</p> : null}
        {statusError ? <p style={{ color: "#c62828", fontWeight: 800 }}>{statusError}</p> : null}
      </SectionCard>

      <SectionCard eyebrow="Schedule configuration" title="Automation cadence">
        <div style={twoCol}>
          {scheduleRowsToShow.map((row) => (
            <ScheduleEditor
              key={row.id}
              row={row}
              disabled={!props.canEdit}
              saving={savingScheduleKey === row.automation_type}
              onChange={updateScheduleRow}
              onSave={saveSchedule}
            />
          ))}
        </div>
      </SectionCard>

      <SectionCard eyebrow="Runtime inspection" title="Latest report seams">
        <div style={twoCol}>
          <RunSummary title="DSW" run={latestDswRun} />
          <RunSummary title="FCC" run={latestFccRun} />
        </div>
      </SectionCard>

      <SectionCard eyebrow="Historical hydration" title="DSW historical sweep">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
          <MiniStat label="Mode" value="DSW only" />
          <MiniStat label="Range" value="Target / historical" />
          <MiniStat label="Queue" value="Pending build" />
        </div>
      </SectionCard>

      <SectionCard eyebrow="Run history" title="Automation audit trail">
        <div style={grid4}>
          <MiniStat label="Runs" value={runs.length} />
          <MiniStat label="Success" value={successCount} />
          <MiniStat label="Failures" value={failedCount} />
          <MiniStat label="Enabled" value={enabledCount} />
        </div>

        <div style={{ overflowX: "auto", marginTop: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ color: "#64748b", textAlign: "left" }}>
                <th style={th}>Started</th>
                <th style={th}>Type</th>
                <th style={th}>Status</th>
                <th style={th}>Duration</th>
                <th style={th}>Rows</th>
                <th style={th}>Match</th>
                <th style={th}>Batch</th>
              </tr>
            </thead>
            <tbody>
              {runs.slice(0, 10).map((run) => (
                <tr key={run.id}>
                  <td style={td}>{formatTime(run.started_at)}</td>
                  <td style={td}>{run.automation_type}</td>
                  <td style={td}>{run.status}</td>
                  <td style={td}>{formatDuration(run.duration_ms)}</td>
                  <td style={td}>{run.inserted_rows ?? "—"}</td>
                  <td style={td}>
                    {run.matched_rows ?? "—"} / {run.unmatched_rows ?? "—"}
                  </td>
                  <td style={td}>{run.batch_id ? run.batch_id.slice(0, 8) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </section>
  );
}

const grid4: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 8,
};

const twoCol: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 10,
};

const sourceBox: CSSProperties = {
  border: "1px solid #e6edf5",
  borderRadius: 12,
  padding: 10,
  background: "#fff",
  display: "grid",
  gap: 8,
};

const sourceTitle: CSSProperties = {
  color: "#0f172a",
  fontSize: 13,
  letterSpacing: "0.06em",
};

const summaryLine: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  color: "#334155",
  fontSize: 12,
  fontWeight: 850,
};

const summaryLabel: CSSProperties = {
  color: "#64748b",
  fontWeight: 800,
};

const fieldLabel: CSSProperties = {
  display: "grid",
  gap: 5,
  color: "#64748b",
  fontSize: 12,
  fontWeight: 850,
};


const timeBox: CSSProperties = {
  border: "1px solid #e6edf5",
  borderRadius: 12,
  padding: "8px 10px",
  background: "#fff",
  display: "grid",
  gap: 6,
};

const timeInput: CSSProperties = {
  border: 0,
  outline: "none",
  background: "transparent",
  color: "#0f172a",
  fontSize: 15,
  fontWeight: 950,
};

const th: CSSProperties = {
  padding: "8px 6px",
  borderBottom: "1px solid #e6edf5",
};

const td: CSSProperties = {
  padding: "8px 6px",
  borderBottom: "1px solid #eef3f8",
  color: "#334155",
  fontWeight: 800,
};
