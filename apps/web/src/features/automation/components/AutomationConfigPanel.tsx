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

type CollectionRequest = {
  id: string;
  company_id: string;
  company_slug: string;
  request_type: string;
  request_status: string;
  priority: number;
  service_date: string | null;
  service_date_start: string | null;
  service_date_end: string | null;
  requested_reports: string[];
  request_payload: Record<string, unknown>;
  duration_ms: number | null;
  error_message: string | null;
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

function StatusPill(props: { tone: "blue" | "green" | "slate"; children: ReactNode }) {
  const palette = {
    blue: { border: "#bfdbfe", background: "#eff6ff", color: "#1d4ed8" },
    green: { border: "#bbf7d0", background: "#f0fdf4", color: "#166534" },
    slate: { border: "#dbe7f3", background: "#f8fafc", color: "#475569" },
  }[props.tone];

  return (
    <span style={{
      border: `1px solid ${palette.border}`,
      background: palette.background,
      color: palette.color,
      borderRadius: 999,
      padding: "6px 10px",
      fontSize: 12,
      fontWeight: 950,
    }}>
      {props.children}
    </span>
  );
}

function ProfileCard(props: {
  title: string;
  badge: string;
  tone: "blue" | "green" | "slate";
  description: string;
  reports: string[];
  footer: string;
}) {
  return (
    <div style={profileCard}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
        <div>
          <h4 style={{ margin: 0, fontSize: 16, color: "#0f172a" }}>{props.title}</h4>
          <p style={{ ...mutedCopy, margin: "6px 0 0" }}>{props.description}</p>
        </div>
        <StatusPill tone={props.tone}>{props.badge}</StatusPill>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {props.reports.map((report) => (
          <span key={report} style={reportChip}>{report}</span>
        ))}
      </div>

      <p style={{ margin: 0, color: "#475569", fontSize: 12, fontWeight: 850 }}>{props.footer}</p>
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

function formatRequestTiming(request: CollectionRequest) {
  const payload = request.request_payload ?? {};
  const cadence = typeof payload.cadence_minutes === "number" ? `${payload.cadence_minutes}m` : null;
  const windows = Array.isArray(payload.windows)
    ? payload.windows
        .map((window) => {
          if (!window || typeof window !== "object") return null;
          const record = window as Record<string, unknown>;
          const report = String(record.report ?? "");
          const start = String(record.start_time ?? "").slice(0, 5);
          const end = String(record.end_time ?? "").slice(0, 5);
          return report && start && end ? `${report} ${start}-${end}` : null;
        })
        .filter(Boolean)
        .join(" · ")
    : "";

  if (cadence && windows) return `${cadence} · ${windows}`;
  if (cadence) return cadence;
  return "—";
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
  const [collectionRequests, setCollectionRequests] = useState<CollectionRequest[]>([]);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [showCredentialEditor, setShowCredentialEditor] = useState(false);
  const [savingScheduleKey, setSavingScheduleKey] = useState<string | null>(null);
  const [queueingRequest, setQueueingRequest] = useState<string | null>(null);

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

  const loadCollectionRequests = useCallback(async () => {
    const res = await fetch(`/api/company/${props.slug}/collection-requests?limit=10`, {
      cache: "no-store",
      credentials: "include",
    });

    const data = await res.json();

    if (!res.ok) throw new Error(data?.error ?? "Failed to load collection requests.");

    setCollectionRequests(Array.isArray(data?.rows) ? data.rows : []);
  }, [props.slug]);

  const loadAll = useCallback(async () => {
    await Promise.all([loadStatus(), loadCredential(), loadSchedule(), loadRuns(), loadCollectionRequests()]);
  }, [loadStatus, loadCredential, loadSchedule, loadRuns, loadCollectionRequests]);

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

  const activeRefreshRows = scheduleRows.filter((row) => row.is_enabled && row.window_preset !== "OFF");
  const activeRefreshReports = activeRefreshRows.map((row) => row.automation_type);
  const refreshCadenceLabel =
    activeRefreshRows.length > 0
      ? `${Math.min(...activeRefreshRows.map((row) => row.cadence_minutes))} min`
      : "Not scheduled";
  const refreshWindowLabel =
    activeRefreshRows.length > 0
      ? activeRefreshRows.map((row) => `${row.automation_type}: ${formatWindow(row)}`).join(" · ")
      : "No active window";

  async function queueWorkdayRefreshRequest() {
    try {
      setQueueingRequest("OPERATIONS_FEED");
      setMessage(null);
      setStatusError(null);

      const res = await fetch(`/api/company/${props.slug}/collection-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          request_type: "OPERATIONS_FEED",
          requested_reports: activeRefreshReports,
          priority: 80,
          request_payload: {
            source: "collection_center",
            intent: "workday_refresh",
            cadence_minutes: activeRefreshRows.length > 0
              ? Math.min(...activeRefreshRows.map((row) => row.cadence_minutes))
              : null,
            windows: activeRefreshRows.map((row) => ({
              report: row.automation_type,
              window_preset: row.window_preset,
              start_time: row.start_time,
              end_time: row.end_time,
              cadence_minutes: row.cadence_minutes,
            })),
          },
        }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data?.error ?? "Failed to prepare refresh ticket.");

      await loadCollectionRequests();
      setMessage("Workday refresh ticket prepared.");
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : "Failed to prepare refresh ticket.");
    } finally {
      setQueueingRequest(null);
    }
  }

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
      <SectionCard eyebrow="Insight Collection Center" title="Collection Health">
        <p style={leadText}>
          Operational dashboards stay current while required platform collections protect historical reporting.
        </p>

        <div style={executiveSignalGrid}>
          <MiniStat label="Collection Health" value={formatStatus(status?.status ?? null)} />

          <button
            type="button"
            style={credentialSignalButton}
            disabled={!props.canEdit}
            onClick={() => setShowCredentialEditor((value) => !value)}
          >
            <span className="context-stat__label">FedEx Connection</span>
            <strong>{credential?.has_secret ? "Credentials Current" : "Credentials Needed"}</strong>
            <span style={{ color: "#2563eb", fontSize: 11, fontWeight: 900 }}>
              {showCredentialEditor ? "Click to close" : "Click to update"}
            </span>
            <span style={{ color: "#64748b", fontSize: 12, fontWeight: 800 }}>
              {credential?.has_secret
                ? `Last verified ${formatDateTime(credential?.last_verified_at)}`
                : "Click to add credentials"}
            </span>
          </button>

          <MiniStat label="Last Successful Collection" value={formatTime(latestDswRun?.started_at ?? latestFccRun?.started_at)} />
        </div>

        <div style={policyStrip}>
          <span style={{ fontWeight: 950, color: "#166534" }}>✓ Platform policy:</span>
          <span>Required integrity collections always receive priority.</span>
        </div>

        {showCredentialEditor ? (
          <div style={credentialEditorBox}>
            <div style={credentialNotice}>
              <strong>Credential changes affect report collection.</strong>
              <span>
                Insight uses this connection only when a collection order is executed. Updating it controls whether the runner can
                reach FedEx and collect operational reports for this company.
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
              <label style={credentialField}>
                <span>FedEx Username</span>
                <input
                  style={credentialInput}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter username"
                  disabled={!props.canEdit}
                />
              </label>

              <label style={credentialField}>
                <span>Password</span>
                <input
                  style={credentialInput}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={credential?.has_secret ? "Enter new password to replace" : "Enter password"}
                  disabled={!props.canEdit}
                />
              </label>
            </div>

            <div className="cta-row">
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
                {verifying ? "Testing..." : "Test Connection"}
              </button>

              <button type="button" className="button" onClick={() => setShowCredentialEditor(false)}>
                Close
              </button>
            </div>
          </div>
        ) : null}

        {message ? <p style={{ color: "#0f9f6e", fontWeight: 800, marginBottom: 0 }}>{message}</p> : null}
        {statusError ? <p style={{ color: "#c62828", fontWeight: 800, marginBottom: 0 }}>{statusError}</p> : null}
      </SectionCard>

      <SectionCard eyebrow="Protected Collections" title="Collection orders Insight depends on">
        <p style={mutedCopy}>
          These collection orders protect the data foundation Insight needs to produce trustworthy operational intelligence.
        </p>

        <div style={profileGrid}>
          <ProfileCard
            title="Previous Day Close"
            badge="Automatic"
            tone="blue"
            description="Closes yesterday before today begins. Today this behavior is driven by prior-day DSW ingestion."
            reports={["Yesterday", "DSW", "Historical completeness"]}
            footer="Purpose: normal daily completion"
          />

          <ProfileCard
            title="Last Look"
            badge="Automatic"
            tone="green"
            description="Takes an in-day final look at today's operation before the day rolls."
            reports={["Today", "DSW", "FCC", "Available artifacts"]}
            footer="Purpose: best available current-day picture"
          />

          <ProfileCard
            title="Historical Backfill"
            badge="Onboarding"
            tone="slate"
            description="Builds historical DSW context so new Insight users can experience the intelligence engine immediately."
            reports={["Date range", "DSW history", "Trend baseline"]}
            footer="Purpose: teach Insight the story behind the operation"
          />

          <ProfileCard
            title="Targeted Recovery"
            badge="Manual"
            tone="blue"
            description="Pulls one identified prior day in isolation to heal a missing, corrupt, or questionable record."
            reports={["Selected date", "DSW", "Record repair"]}
            footer="Purpose: recover trustworthy historical truth"
          />
        </div>
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

      <SectionCard eyebrow="Workday Refresh" title="Live data freshness">
        <div style={workdayRefreshCard}>
          <div>
            <p style={mutedCopy}>
              These saved presets prepare small all-day refresh tickets that keep operations current without getting in the way of larger collection work.
            </p>
            <div style={grid4}>
              <MiniStat label="Included Reports" value={activeRefreshReports.length ? activeRefreshReports.join(" + ") : "None"} />
              <MiniStat label="Refresh Cadence" value={refreshCadenceLabel} />
              <MiniStat label="Refresh Window" value={refreshWindowLabel} />
              <MiniStat label="Priority" value="80" />
            </div>
          </div>

          <button
            type="button"
            className="button button-primary"
            disabled={!props.canEdit || queueingRequest === "OPERATIONS_FEED" || activeRefreshReports.length === 0}
            onClick={queueWorkdayRefreshRequest}
          >
            {queueingRequest === "OPERATIONS_FEED" ? "Preparing..." : "Prepare Refresh Ticket"}
          </button>
        </div>
      </SectionCard>

      <SectionCard eyebrow="Request Warehouse" title="Recent collection requests">
        <div style={grid4}>
          <MiniStat label="Requests" value={collectionRequests.length} />
          <MiniStat label="Queued" value={collectionRequests.filter((request) => request.request_status === "QUEUED").length} />
          <MiniStat label="Running" value={collectionRequests.filter((request) => request.request_status === "RUNNING" || request.request_status === "CLAIMED").length} />
          <MiniStat label="Complete" value={collectionRequests.filter((request) => request.request_status === "COMPLETE").length} />
        </div>

        <div style={{ overflowX: "auto", marginTop: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ color: "#64748b", textAlign: "left" }}>
                <th style={th}>Created</th>
                <th style={th}>Request</th>
                <th style={th}>Status</th>
                <th style={th}>Priority</th>
                <th style={th}>Date</th>
                <th style={th}>Reports</th>
                <th style={th}>Timing</th>
                <th style={th}>Duration</th>
              </tr>
            </thead>
            <tbody>
              {collectionRequests.map((request) => (
                <tr key={request.id}>
                  <td style={td}>{formatTime(request.created_at)}</td>
                  <td style={td}>{request.request_type}</td>
                  <td style={td}>{request.request_status}</td>
                  <td style={td}>{request.priority}</td>
                  <td style={td}>{request.service_date ?? request.service_date_start ?? "—"}</td>
                  <td style={td}>{request.requested_reports?.join(", ") || "—"}</td>
                  <td style={td}>{formatRequestTiming(request)}</td>
                  <td style={td}>{formatDuration(request.duration_ms)}</td>
                </tr>
              ))}
              {collectionRequests.length === 0 ? (
                <tr>
                  <td style={td} colSpan={7}>No collection requests yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
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

const executiveSignalGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "0.8fr 1.4fr 0.8fr",
  gap: 10,
  marginTop: 12,
};

const credentialSignalButton: CSSProperties = {
  border: "1px solid #bfdbfe",
  borderRadius: 16,
  padding: "9px 10px",
  background: "#fff",
  display: "grid",
  gap: 3,
  textAlign: "left",
  cursor: "pointer",
  minHeight: 58,
  boxShadow: "0 12px 30px rgba(37, 99, 235, 0.06)",
};

const policyStrip: CSSProperties = {
  marginTop: 10,
  border: "1px solid #bbf7d0",
  borderRadius: 999,
  padding: "7px 10px",
  background: "#f0fdf4",
  color: "#166534",
  display: "flex",
  gap: 6,
  alignItems: "center",
  fontSize: 12,
  fontWeight: 850,
};

const heroGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.4fr 0.8fr",
  gap: 12,
  alignItems: "stretch",
  marginBottom: 12,
};

const leadText: CSSProperties = {
  margin: 0,
  color: "#334155",
  fontSize: 14,
  lineHeight: 1.55,
  fontWeight: 750,
};

const mutedCopy: CSSProperties = {
  margin: "0 0 12px",
  color: "#64748b",
  fontSize: 13,
  lineHeight: 1.5,
  fontWeight: 750,
};

const capacityBox: CSSProperties = {
  border: "1px solid #dbe7f3",
  borderRadius: 16,
  padding: 12,
  background: "linear-gradient(180deg, #f8fbff 0%, #ffffff 100%)",
  display: "grid",
  gap: 6,
};

const connectionStripButton: CSSProperties = {
  border: "1px solid #dbe7f3",
  borderRadius: 16,
  padding: 12,
  background: "#fff",
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  marginTop: 12,
  width: "100%",
  textAlign: "left",
  cursor: "pointer",
};

const credentialEditorBox: CSSProperties = {
  border: "1px dashed #bfdbfe",
  borderRadius: 16,
  padding: 12,
  background: "#f8fbff",
  display: "grid",
  gap: 10,
  marginTop: 12,
};

const credentialNotice: CSSProperties = {
  border: "1px solid #dbe7f3",
  borderRadius: 14,
  padding: "10px 12px",
  background: "#fff",
  color: "#334155",
  display: "grid",
  gap: 4,
  fontSize: 12,
  fontWeight: 800,
  lineHeight: 1.45,
};

const credentialField: CSSProperties = {
  border: "1px solid #dbe7f3",
  borderRadius: 16,
  padding: "9px 12px",
  background: "#fff",
  display: "grid",
  gap: 5,
  color: "#64748b",
  fontSize: 11,
  fontWeight: 950,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const credentialInput: CSSProperties = {
  border: 0,
  outline: "none",
  background: "transparent",
  color: "#0f172a",
  fontSize: 15,
  fontWeight: 900,
  minHeight: 28,
};

const profileGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 10,
};

const profileCard: CSSProperties = {
  border: "1px solid #e6edf5",
  borderRadius: 16,
  padding: 10,
  background: "#fff",
  display: "grid",
  gap: 9,
  alignContent: "start",
  boxShadow: "0 10px 28px rgba(15, 23, 42, 0.04)",
};

const workdayRefreshCard: CSSProperties = {
  border: "1px solid #dbe7f3",
  borderRadius: 16,
  padding: 12,
  background: "#fff",
  display: "grid",
  gridTemplateColumns: "1fr auto",
  gap: 12,
  alignItems: "center",
};

const reportChip: CSSProperties = {
  border: "1px solid #e6edf5",
  background: "#f8fafc",
  color: "#334155",
  borderRadius: 999,
  padding: "5px 8px",
  fontSize: 11,
  fontWeight: 900,
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
