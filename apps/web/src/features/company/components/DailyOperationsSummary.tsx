"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";

type CalendarStatus = "final" | "in_day" | "inactive" | "empty";

type CalendarDay = {
  service_date: string;
  status: CalendarStatus;
};

type SummaryPayload = {
  company_name: string;
  service_date: string;
  company_identity: {
    contract_number: string | null;
    terminal_identity: string | null;
    service_area: string | null;
    status: string | null;
    effective_start_date: string | null;
    effective_end_date: string | null;
  } | null;
  summary: {
    batch_id: string;
    source_filename: string | null;
    created_at: string | null;
    summary_label?: string | null;
    terminal_code?: string | null;
    route_count: number;
    normalized_row_json: Record<string, unknown>;
  } | null;
  time_critical: {
    early_late_pickups: number;
    potential_missed_pickups: number;
    express: {
      package_count: number;
      completed_package_count: number;
      open_package_count: number;
      tracking_gap_package_count: number;
    };
  };
  dispatch_actions: DispatchAction[];
};

type DispatchAction = {
  id: string;
  event_code: string;
  event_label: string;
  event_category: string;
  route_key: string | null;
  route_label: string | null;
  seat: string | null;
  person_name: string | null;
  from_route_key: string | null;
  from_route_label: string | null;
  to_route_key: string | null;
  to_route_label: string | null;
  note: string | null;
  created_at: string;
  created_by_name: string | null;
};

type WatchlistNote = {
  id: string;
  note_type: "NOTE" | "ACTION" | "RESOLUTION" | "CORRECTION";
  body: string;
  client_visible: boolean;
  created_at: string;
  created_by_name: string | null;
};

type WatchlistItem = {
  id: string;
  service_date: string;
  signal_type: string;
  route_key: string | null;
  title: string;
  detail: string;
  source_family: string;
  severity: "INFO" | "WATCH" | "RISK" | "CRITICAL";
  status: "NEW" | "ACKNOWLEDGED" | "IN_PROGRESS" | "MONITORING" | "RESOLVED" | "DISMISSED";
  resolution_class: string | null;
  assigned_profile_id: string | null;
  assigned_to_name: string | null;
  due_at: string | null;
  client_visible: boolean;
  updated_at: string;
  notes: WatchlistNote[];
  evidence: {
    packages: Array<{
      route_key: string;
      route_label: string | null;
      tracking_id: string | null;
      st_number: string | null;
      sid: string | null;
      signal_state: "OPEN" | "TRACKING_GAP" | "COMPLETED";
    }>;
  };
};

type WatchlistAssignee = { id: string; name: string; title: string | null };

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

function monthStart(dateIso: string) {
  return `${dateIso.slice(0, 7)}-01`;
}

function addMonths(dateIso: string, months: number) {
  const d = new Date(`${monthStart(dateIso)}T12:00:00.000Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

function monthLabel(dateIso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${monthStart(dateIso)}T12:00:00.000Z`));
}

function dateLabel(dateIso: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${dateIso}T12:00:00.000Z`));
}

function timeLabel(timestamp: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  }).format(new Date(timestamp));
}

function dispatchActionContext(action: DispatchAction) {
  const route = action.route_label || action.route_key;
  const from = action.from_route_label || action.from_route_key;
  const to = action.to_route_label || action.to_route_key;
  const movement = from || to ? [from || "Unassigned", to || "Unassigned"].join(" → ") : null;
  return [route, movement, action.person_name, action.seat].filter(Boolean).join(" · ");
}

function rollupDispatchActions(actions: DispatchAction[]) {
  const groups = new Map<string, {
    key: string;
    label: string;
    category: string;
    actions: DispatchAction[];
    contexts: string[];
    notes: string[];
  }>();

  for (const action of actions) {
    const key = `${action.event_category}:${action.event_code}`;
    const group = groups.get(key) ?? {
      key,
      label: action.event_label,
      category: action.event_category,
      actions: [],
      contexts: [],
      notes: [],
    };
    const context = dispatchActionContext(action);
    group.actions.push(action);
    if (context && !group.contexts.includes(context)) group.contexts.push(context);
    if (action.note && !group.notes.includes(action.note)) group.notes.push(action.note);
    groups.set(key, group);
  }

  return Array.from(groups.values()).sort((a, b) =>
    new Date(a.actions[0].created_at).getTime() - new Date(b.actions[0].created_at).getTime()
  );
}

function dispatchTimeRange(actions: DispatchAction[]) {
  const first = timeLabel(actions[0].created_at);
  const last = timeLabel(actions[actions.length - 1].created_at);
  return first === last ? first : `${first}–${last}`;
}

function calendarCells(monthIso: string) {
  const first = new Date(`${monthStart(monthIso)}T12:00:00.000Z`);
  const startOffset = (first.getUTCDay() + 1) % 7;
  const start = new Date(first);
  start.setUTCDate(first.getUTCDate() - startOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + index);
    return d.toISOString().slice(0, 10);
  });
}

function n(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function fmt(value: unknown, digits = 0) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(n(value));
}

function pct(value: number) {
  return `${value.toFixed(3)}%`;
}

function safeDiv(a: number, b: number) {
  return b ? a / b : 0;
}

function statusStyle(status: CalendarStatus, selected: boolean): CSSProperties {
  const base: CSSProperties = {
    height: 26,
    minWidth: 26,
    borderRadius: 8,
    border: "1px solid #e2e8f0",
    fontSize: 11,
    fontWeight: 900,
    cursor: "pointer",
    background: "#fff",
  };

  if (status === "final") Object.assign(base, { background: "#ecfdf5", borderColor: "#16a34a", color: "#166534" });
  if (status === "in_day") Object.assign(base, { background: "#fffbeb", borderColor: "#f59e0b", color: "#92400e" });
  if (status === "inactive") Object.assign(base, { background: "#f8fafc", color: "#94a3b8", textDecoration: "line-through" });
  if (selected) Object.assign(base, { outline: "2px solid #0f172a", outlineOffset: 1 });

  return base;
}

function ReportSection(props: { title: string; children: React.ReactNode; style?: CSSProperties }) {
  return (
    <section
      style={{
        border: "1px solid #d7e2f2",
        borderRadius: 14,
        background: "#ffffff",
        padding: 12,
        ...props.style,
      }}
    >
      <h3
        style={{
          margin: 0,
          color: "#0f172a",
          fontSize: 12,
          fontWeight: 950,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {props.title}
      </h3>
      <div style={{ marginTop: 9 }}>{props.children}</div>
    </section>
  );
}

function RoutePerformanceGraph({
  rows,
  routeCount,
}: {
  rows: Array<{ label: string; planned: number; actual: number; tone: "packages" | "stops" | "pickups" }>;
  routeCount: number;
}) {
  return (
    <div className="ops-route-graph">
      <div className="ops-route-graph__legend">
        <span><i className="ops-route-graph__dot ops-route-graph__dot--planned" />Planned / tendered</span>
        <span><i className="ops-route-graph__dot ops-route-graph__dot--actual" />Actual / completed</span>
        <strong>{fmt(routeCount)} routes</strong>
      </div>
      <div className="ops-route-graph__plot">
        {rows.map((row) => {
          const ceiling = Math.max(row.planned, row.actual, 1);
          const variance = row.actual - row.planned;
          return (
            <article key={row.label} className={`ops-route-graph__row ops-route-graph__row--${row.tone}`}>
              <div className="ops-route-graph__label">
                <strong>{row.label}</strong>
                <span>{variance >= 0 ? "+" : ""}{fmt(variance)} variance</span>
              </div>
              <div className="ops-route-graph__tracks">
                <div><span className="ops-route-graph__bar ops-route-graph__bar--planned" style={{ width: `${(row.planned / ceiling) * 100}%` }} /><b>{fmt(row.planned)}</b></div>
                <div><span className="ops-route-graph__bar ops-route-graph__bar--actual" style={{ width: `${(row.actual / ceiling) * 100}%` }} /><b>{fmt(row.actual)}</b></div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function CodePerformanceGrid({
  rows,
}: {
  rows: Array<{ label: string; count: string; rate: string; target: string; status: "meets" | "watch" | "miss" | "na" }>;
}) {
  const statusLabel = {
    meets: "Meets",
    watch: "Watch",
    miss: "Miss",
    na: "n/a",
  } as const;

  return (
    <div className="ops-code-grid">
      {rows.map((row) => (
        <article key={row.label} className={`ops-code-card ops-code-card--${row.status}`}>
          <div className="ops-code-card__head">
            <span className="ops-code-card__signal"><i />{statusLabel[row.status]}</span>
            <strong>{row.label}</strong>
          </div>
          <div className="ops-code-card__reading">{row.rate}</div>
          <div className="ops-code-card__telemetry">
            <span><small>Count</small><strong>{row.count}</strong></span>
            <span><small>Target</small><strong>{row.target}</strong></span>
          </div>
          <div className="ops-code-card__rail"><span /></div>
        </article>
      ))}
    </div>
  );
}

function SignalRow(props: { tone: "clear" | "watch" | "risk"; title: string; detail: string }) {
  const toneStyle =
    props.tone === "clear"
      ? { bg: "#ffffff", border: "#d7e2f2", fg: "#166534", dot: "#22c55e" }
      : props.tone === "watch"
        ? { bg: "#fffbeb", border: "#fde68a", fg: "#92400e", dot: "#f59e0b" }
        : { bg: "#fef2f2", border: "#fecaca", fg: "#991b1b", dot: "#ef4444" };

  return (
    <div
      style={{
        border: `1px solid ${toneStyle.border}`,
        background: toneStyle.bg,
        borderRadius: 12,
        padding: "8px 10px",
        display: "grid",
        gridTemplateColumns: "10px 1fr",
        gap: 8,
        alignItems: "start",
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: toneStyle.dot,
          marginTop: 5,
        }}
      />
      <span>
        <strong style={{ display: "block", color: toneStyle.fg, fontSize: 12 }}>{props.title}</strong>
        <span style={{ display: "block", color: "#475569", fontSize: 12, marginTop: 2 }}>{props.detail}</span>
      </span>
    </div>
  );
}

function KpiCard(props: { label: string; value: string; detail: string; tone?: "neutral" | "good" | "watch" | "risk" | "data" }) {
  const tones = {
    neutral: { border: "#cbd5e1", bg: "#ffffff", fg: "#0f172a" },
    good: { border: "#22c55e", bg: "#f0fdf4", fg: "#166534" },
    watch: { border: "#f59e0b", bg: "#fffbeb", fg: "#92400e" },
    risk: { border: "#ef4444", bg: "#fef2f2", fg: "#991b1b" },
    data: { border: "#8b5cf6", bg: "#f5f3ff", fg: "#6d28d9" },
  };
  const tone = tones[props.tone ?? "neutral"];
  return (
    <article
      style={{
        borderTop: `4px solid ${tone.border}`,
        borderRight: `1px solid ${tone.border}`,
        borderBottom: `1px solid ${tone.border}`,
        borderLeft: `1px solid ${tone.border}`,
        borderRadius: 14,
        padding: "12px 13px",
        background: tone.bg,
        minHeight: 92,
      }}
    >
      <div style={{ color: "#64748b", fontSize: 10, fontWeight: 950, letterSpacing: "0.08em", textTransform: "uppercase" }}>{props.label}</div>
      <strong style={{ display: "block", color: tone.fg, fontSize: 23, lineHeight: 1.1, marginTop: 7 }}>{props.value}</strong>
      <span style={{ display: "block", color: "#64748b", fontSize: 11, marginTop: 6 }}>{props.detail}</span>
    </article>
  );
}

function prettyStatus(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

type WatchlistWorkflow = {
  title: string;
  objective: string;
  steps: string[];
  recommendedState: WatchlistItem["status"];
  noteType: WatchlistNote["note_type"];
  notePrompt: string;
};

function workflowForSignal(signalType: string): WatchlistWorkflow {
  const workflows: Record<string, WatchlistWorkflow> = {
    ILS_TARGET_MISS: {
      title: "Review service exceptions and document the response",
      objective: "Identify the service-code or scan pattern behind the ILS miss, then leave a concise corrective plan for the operating review.",
      steps: [
        "Review DSW code performance and exception counts.",
        "Identify the affected routes, drivers, or systemic condition.",
        "Record the finding and the corrective action or coaching plan.",
        "Move the item to Monitoring; resolve it after the follow-up is confirmed.",
      ],
      recommendedState: "IN_PROGRESS",
      noteType: "ACTION",
      notePrompt: "Summarize the exception pattern, likely cause, and corrective plan. Keep the record factual and action-oriented.",
    },
    EXPRESS_OPEN: {
      title: "Confirm the disposition of incomplete Express packages",
      objective: "Investigate each manifest-linked package whose associated stop is not marked complete. This is an incomplete source status, not yet a confirmed service failure.",
      steps: [
        "Review each tracking ID in the evidence list.",
        "Confirm disposition with the driver, terminal, or authoritative tracking source.",
        "Record the verified outcome and any escalation or correction.",
        "Resolve using the disposition supported by the investigation.",
      ],
      recommendedState: "IN_PROGRESS",
      noteType: "ACTION",
      notePrompt: "Record the tracking IDs reviewed, confirmed disposition, and any terminal or driver follow-up.",
    },
    EXPRESS_TRACKING_GAP: {
      title: "Reconcile the Express stop-link gap",
      objective: "Determine why the package has no matching completion link. The package remains provisionally treated as delivered until contrary evidence is found.",
      steps: [
        "Review the tracking ID and manifest identifiers below.",
        "Compare the package with the authoritative tracking or terminal record.",
        "Correct the source linkage or record the confirmed disposition.",
        "Resolve as a tracking gap, source-data error, or verified service failure.",
      ],
      recommendedState: "IN_PROGRESS",
      noteType: "CORRECTION",
      notePrompt: "Record the tracking IDs reconciled, the authoritative result, and any linkage correction required.",
    },
    EARLY_LATE_PICKUPS: {
      title: "Review early and late pickup execution",
      objective: "Explain the DSW timing exception and document whether an operating response is required.",
      steps: [
        "Review the E/L pickup entries and scheduled windows.",
        "Confirm actual execution time and operating context.",
        "Record the cause, customer impact, and corrective response.",
        "Monitor recurrence or resolve when the review is complete.",
      ],
      recommendedState: "IN_PROGRESS",
      noteType: "ACTION",
      notePrompt: "Summarize the pickup timing review, cause, impact, and corrective response.",
    },
    POTENTIAL_MISSED_PICKUPS: {
      title: "Verify pickup completion before classifying the miss",
      objective: "Confirm the pickup outcome against execution evidence before treating the DSW signal as a service failure.",
      steps: [
        "Identify the pickup and review the planned commitment.",
        "Confirm the actual stop and package outcome.",
        "Record the verified result and any recovery action.",
        "Resolve as confirmed failure, corrected operation, or no action required.",
      ],
      recommendedState: "IN_PROGRESS",
      noteType: "ACTION",
      notePrompt: "Record the pickup reviewed, verified outcome, and recovery or follow-up action.",
    },
  };

  return workflows[signalType] ?? {
    title: "Validate the operating signal",
    objective: "Establish what happened, record the evidence reviewed, and document the appropriate response.",
    steps: ["Review the source evidence.", "Confirm the operating outcome.", "Record the response and disposition."],
    recommendedState: "IN_PROGRESS",
    noteType: "ACTION",
    notePrompt: "Record what was reviewed, what happened, and what action is planned or complete.",
  };
}

function WatchlistDrawer(props: {
  item: WatchlistItem;
  assignees: WatchlistAssignee[];
  busy: boolean;
  onClose: () => void;
  onUpdate: (values: Partial<WatchlistItem>) => Promise<void>;
  onAddNote: (body: string, noteType: string, clientVisible: boolean) => Promise<void>;
}) {
  const workflow = workflowForSignal(props.item.signal_type);
  const [status, setStatus] = useState(props.item.status);
  const [assignee, setAssignee] = useState(props.item.assigned_profile_id ?? "");
  const [dueAt, setDueAt] = useState(props.item.due_at?.slice(0, 10) ?? "");
  const [resolutionClass, setResolutionClass] = useState(props.item.resolution_class ?? "");
  const [clientVisible, setClientVisible] = useState(props.item.client_visible);
  const [noteBody, setNoteBody] = useState("");
  const [noteType, setNoteType] = useState<WatchlistNote["note_type"]>(workflow.noteType);
  const [noteVisible, setNoteVisible] = useState(true);
  const [copiedTrackingId, setCopiedTrackingId] = useState<string | null>(null);
  const isClosed = status === "RESOLVED" || status === "DISMISSED";

  async function copyTrackingId(trackingId: string) {
    try {
      await navigator.clipboard.writeText(trackingId);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = trackingId;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }

    setCopiedTrackingId(trackingId);
    window.setTimeout(() => {
      setCopiedTrackingId((current) => current === trackingId ? null : current);
    }, 1800);
  }

  return (
    <div className="ops-watch-drawer-backdrop" onMouseDown={props.onClose}>
      <aside className="ops-watch-drawer" aria-label="Watchlist action drawer" onMouseDown={(event) => event.stopPropagation()}>
        <header className="ops-watch-drawer__header">
          <div className="ops-watch-drawer__heading">
            <div className="ops-watch-drawer__eyebrow"><span>Actionable watchlist</span><span className={`ops-watch-badge ops-watch-badge--${props.item.severity.toLowerCase()}`}>{prettyStatus(props.item.severity)}</span></div>
            <h2>{props.item.title}</h2>
            <p>{props.item.detail}</p>
          </div>
          <button className="ops-watch-drawer__close" type="button" aria-label="Close watchlist drawer" onClick={props.onClose}>×</button>
        </header>

        <div className="ops-watch-drawer__body">
          <section className="ops-watch-signal-card">
            <div><span>Route</span><strong>{props.item.route_key ?? "All routes"}</strong></div>
            <div><span>Service date</span><strong>{dateLabel(props.item.service_date)}</strong></div>
            <div><span>Source</span><strong>{props.item.source_family}</strong></div>
            <div><span>Current state</span><strong>{prettyStatus(props.item.status)}</strong></div>
          </section>

          <section className="ops-watch-panel ops-watch-workflow">
            <div className="ops-watch-panel__header">
              <div><span className="ops-watch-panel__eyebrow">Workflow expectation</span><h3>{workflow.title}</h3></div>
              <span className="ops-watch-state ops-watch-state--open">Next · {prettyStatus(workflow.recommendedState)}</span>
            </div>
            <p className="ops-watch-workflow__objective">{workflow.objective}</p>
            <ol className="ops-watch-workflow__steps">{workflow.steps.map((step) => <li key={step}>{step}</li>)}</ol>
            {props.item.evidence.packages.length ? (
              <div className="ops-watch-evidence">
                <div className="ops-watch-evidence__header"><strong>Package evidence</strong><span>{props.item.evidence.packages.length} tracking {props.item.evidence.packages.length === 1 ? "ID" : "IDs"}</span></div>
                <div className="ops-watch-evidence__list">
                  {props.item.evidence.packages.map((entry, index) => (
                    <article key={`${entry.tracking_id ?? "missing"}-${index}`}>
                      <span>{entry.signal_state === "OPEN" ? "Incomplete stop link" : "Tracking-link gap"}</span>
                      {entry.tracking_id ? (
                        <button
                          className={`ops-watch-evidence__tracking${copiedTrackingId === entry.tracking_id ? " ops-watch-evidence__tracking--copied" : ""}`}
                          type="button"
                          title="Copy tracking number"
                          aria-label={`Copy tracking number ${entry.tracking_id}`}
                          onClick={() => copyTrackingId(entry.tracking_id as string)}
                        >
                          <strong>{entry.tracking_id}</strong>
                          <span aria-live="polite">{copiedTrackingId === entry.tracking_id ? "Copied" : "Copy"}</span>
                        </button>
                      ) : <strong>Tracking number unavailable</strong>}
                      <small>{[entry.route_label || entry.route_key, entry.st_number ? `Stop ${entry.st_number}` : null, entry.sid ? `SID ${entry.sid}` : null].filter(Boolean).join(" · ")}</small>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}
          </section>

          <section className="ops-watch-panel">
            <div className="ops-watch-panel__header">
              <div><span className="ops-watch-panel__eyebrow">Decision controls</span><h3>Ownership and disposition</h3></div>
              <span className={`ops-watch-state ops-watch-state--${isClosed ? "closed" : "open"}`}>{isClosed ? "Closed" : "Action required"}</span>
            </div>
            <div className="ops-watch-form-grid">
              <label className="ops-watch-field">Status
                <select value={status} onChange={(event) => setStatus(event.target.value as WatchlistItem["status"])}>
              {(["NEW", "ACKNOWLEDGED", "IN_PROGRESS", "MONITORING", "RESOLVED", "DISMISSED"] as const).map((value) => <option key={value} value={value}>{prettyStatus(value)}</option>)}
                </select>
              </label>
              <label className="ops-watch-field">Owner
                <select value={assignee} onChange={(event) => setAssignee(event.target.value)}>
              <option value="">Unassigned</option>
              {props.assignees.map((person) => <option key={person.id} value={person.id}>{person.name}{person.title ? ` · ${person.title}` : ""}</option>)}
                </select>
              </label>
              <label className="ops-watch-field">Due date
                <input type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
              </label>
              <label className="ops-watch-field">Resolution
                <select value={resolutionClass} onChange={(event) => setResolutionClass(event.target.value)}>
              <option value="">Not resolved</option>
              {["SERVICE_FAILURE_CONFIRMED", "CORRECTED_OPERATIONALLY", "TRACKING_GAP", "SOURCE_DATA_ERROR", "NO_ACTION_REQUIRED", "ESCALATED_EXTERNALLY"].map((value) => <option key={value} value={value}>{prettyStatus(value)}</option>)}
                </select>
              </label>
            </div>
            <div className="ops-watch-panel__footer">
              <label className="ops-watch-visibility"><input type="checkbox" checked={clientVisible} onChange={(event) => setClientVisible(event.target.checked)} /><span><strong>Client report visibility</strong><small>Include this item in shared operating briefs.</small></span></label>
              <button className="button buttonPrimary" type="button" disabled={props.busy} onClick={() => props.onUpdate({ status, assigned_profile_id: assignee || null, due_at: dueAt || null, resolution_class: resolutionClass || null, client_visible: clientVisible })}>{props.busy ? "Saving…" : "Save changes"}</button>
            </div>
          </section>

          <section className="ops-watch-panel">
            <div className="ops-watch-panel__header"><div><span className="ops-watch-panel__eyebrow">Evidence ledger</span><h3>Action trail</h3></div><span className="ops-watch-note-count">{props.item.notes.length} entries</span></div>
          <div className="ops-watch-timeline">
            {props.item.notes.length ? props.item.notes.map((note) => (
              <article key={note.id} className="ops-watch-timeline__entry">
                <div className="ops-watch-timeline__meta">
                  <span>{prettyStatus(note.note_type)}{note.client_visible ? " · Client visible" : " · Internal"}</span>
                  <span>{new Date(note.created_at).toLocaleString()}</span>
                </div>
                <p>{note.body}</p>
                <small>{note.created_by_name ?? "Team Optix"}</small>
              </article>
            )) : <div className="ops-watch-empty"><strong>No activity recorded</strong><span>Record the first action below to establish the management trail.</span></div>}
          </div>

          <div className="ops-watch-composer">
            <div className="ops-watch-composer__header"><div><span className="ops-watch-panel__eyebrow">Next action</span><h3>Record work performed</h3></div></div>
            <div className="ops-watch-composer__controls">
              <label className="ops-watch-field">Entry type<select value={noteType} onChange={(event) => setNoteType(event.target.value as WatchlistNote["note_type"])}>
                <option value="ACTION">Action taken</option><option value="NOTE">Note</option><option value="RESOLUTION">Resolution</option><option value="CORRECTION">Data correction</option>
              </select></label>
              <label className="ops-watch-visibility ops-watch-visibility--compact"><input type="checkbox" checked={noteVisible} onChange={(event) => setNoteVisible(event.target.checked)} /><span><strong>Client visible</strong><small>Show in the shared report.</small></span></label>
            </div>
            <textarea className="ops-watch-composer__textarea" value={noteBody} onChange={(event) => setNoteBody(event.target.value)} rows={4} placeholder={workflow.notePrompt} />
            <div className="ops-watch-composer__footer"><span>{noteBody.trim().length ? `${noteBody.trim().length} characters` : "A concise operational record is best."}</span><button className="button buttonPrimary" type="button" disabled={props.busy || !noteBody.trim()} onClick={async () => { await props.onAddNote(noteBody.trim(), noteType, noteVisible); setNoteBody(""); }}>Add entry</button></div>
          </div>
        </section>
        </div>
      </aside>
    </div>
  );
}

export default function DailyOperationsSummary({ slug }: { slug: string }) {
  const today = todayNyIso();
  const defaultDate = addDaysIso(today, -1);

  const [selectedDate, setSelectedDate] = useState(defaultDate);
  const [visibleMonth, setVisibleMonth] = useState(monthStart(defaultDate));
  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
  const [payload, setPayload] = useState<SummaryPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [assignees, setAssignees] = useState<WatchlistAssignee[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [watchlistBusy, setWatchlistBusy] = useState(false);
  const [watchlistError, setWatchlistError] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareRecipients, setShareRecipients] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState(false);

  const calendarMap = useMemo(
    () => new Map(calendarDays.map((day) => [day.service_date, day.status])),
    [calendarDays]
  );

  useEffect(() => {
    let active = true;

    async function loadCalendar() {
      const startDate = addDaysIso(today, -540);
      const endDate = today;

      const res = await fetch(
        `/api/company/${slug}/operations/reports/daily-operations-calendar?startDate=${startDate}&endDate=${endDate}`,
        { cache: "no-store", credentials: "include" }
      );
      const data = await res.json();

      if (!active) return;
      setCalendarDays(data.days ?? []);
    }

    void loadCalendar();

    return () => {
      active = false;
    };
  }, [slug, today]);

  useEffect(() => {
    let active = true;

    async function loadSummary() {
      setError(null);

      const res = await fetch(`/api/company/${slug}/operations/reports/daily-operations-summary?date=${selectedDate}`, {
        cache: "no-store",
        credentials: "include",
      });
      const data = await res.json();

      if (!active) return;

      if (!res.ok) {
        setPayload(null);
        setError(data?.error ?? "Failed to load Daily Operations Summary.");
        return;
      }

      setPayload(data);
    }

    void loadSummary();

    return () => {
      active = false;
    };
  }, [slug, selectedDate]);

  async function loadWatchlist() {
    const res = await fetch(`/api/company/${slug}/operations/reports/watchlist?date=${selectedDate}`, {
      cache: "no-store",
      credentials: "include",
    });
    const data = await res.json();
    if (!res.ok) {
      setWatchlistError(data?.error ?? "Failed to load the Actionable Watchlist.");
      return;
    }
    setWatchlist(Array.isArray(data.items) ? data.items : []);
    setAssignees(Array.isArray(data.assignees) ? data.assignees : []);
    setWatchlistError(null);
  }

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      if (active) void loadWatchlist();
    }, 150);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
    // The summary request materializes canonical signal identities before this read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, selectedDate, payload?.summary?.batch_id]);

  async function updateWatchlistItem(item: WatchlistItem, values: Partial<WatchlistItem>) {
    setWatchlistBusy(true);
    setWatchlistError(null);
    try {
      const next = { ...item, ...values };
      const res = await fetch(`/api/company/${slug}/operations/reports/watchlist`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_id: item.id,
          status: next.status,
          assigned_profile_id: next.assigned_profile_id,
          due_at: next.due_at,
          resolution_class: next.resolution_class,
          client_visible: next.client_visible,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to update watchlist item.");
      await loadWatchlist();
    } catch (caught) {
      setWatchlistError(caught instanceof Error ? caught.message : "Failed to update watchlist item.");
    } finally {
      setWatchlistBusy(false);
    }
  }

  async function addWatchlistNote(itemId: string, body: string, noteType: string, clientVisible: boolean) {
    setWatchlistBusy(true);
    setWatchlistError(null);
    try {
      const res = await fetch(`/api/company/${slug}/operations/reports/watchlist`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: itemId, body, note_type: noteType, client_visible: clientVisible }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to add action note.");
      await loadWatchlist();
    } catch (caught) {
      setWatchlistError(caught instanceof Error ? caught.message : "Failed to add action note.");
    } finally {
      setWatchlistBusy(false);
    }
  }

  async function shareReport() {
    setShareBusy(true);
    setShareStatus(null);
    try {
      const res = await fetch(`/api/company/${slug}/operations/reports/daily-operations-share`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service_date: selectedDate, recipients: shareRecipients, message: shareMessage }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to share the report.");
      setShareStatus(`Sent to ${data.recipients.join(", ")}.`);
      setShareRecipients("");
      setShareMessage("");
    } catch (caught) {
      setShareStatus(caught instanceof Error ? caught.message : "Failed to share the report.");
    } finally {
      setShareBusy(false);
    }
  }

  const summary = payload?.summary;
  const row = summary?.normalized_row_json ?? {};

  const routes = n(summary?.route_count);
  const vscan = n(row.vscan_packages);
  const delStops = n(row.planned_delivery_stops);
  const puStops = n(row.planned_pickup_stops);
  const actDelStops = n(row.actual_delivery_stops);
  const actDelPkgs = n(row.actual_delivery_packages);
  const actPuStops = n(row.actual_pickup_stops);
  const actPuPkgs = n(row.actual_pickup_packages);
  const diff = n(row.diff);

  const rls = n(row.required_signature);
  const ils = n(row.ils_impact_packages);
  const code85 = n(row.code_85);
  const allCodes = n(row.all_status_code_packages);
  const dna = n(row.dna);
  const exceptions = n(row.exceptions);
  const ilsPercent = n(row.ils_percent);
  const earlyLatePickups = n(payload?.time_critical?.early_late_pickups);
  const potentialMissedPickups = n(payload?.time_critical?.potential_missed_pickups);
  const express = payload?.time_critical?.express ?? {
    package_count: 0,
    completed_package_count: 0,
    open_package_count: 0,
    tracking_gap_package_count: 0,
  };
  const pickupVariance = actPuStops - puStops;
  const selectedWatchlistItem = watchlist.find((item) => item.id === selectedItemId) ?? null;
  const openWatchlist = watchlist.filter((item) => !["RESOLVED", "DISMISSED"].includes(item.status));
  const resolvedWatchlist = watchlist.filter((item) => ["RESOLVED", "DISMISSED"].includes(item.status));

  const avgVscan = safeDiv(vscan, routes);
  const avgDelStops = safeDiv(delStops, routes);
  const avgActDelStops = safeDiv(actDelStops, routes);
  const avgActDelPkgs = safeDiv(actDelPkgs, routes);
  const avgActPuPkgs = safeDiv(actPuPkgs, routes);

  const rlsRate = 100 - safeDiv(rls, vscan) * 100;
  const code85Rate = safeDiv(code85, vscan) * 100;
  const allCodesRate = safeDiv(allCodes, vscan) * 100;
  const dnaRate = safeDiv(dna, vscan) * 100;
  const exceptionRate = safeDiv(exceptions, vscan) * 100;

  const codeRows = [
    { label: "RLS", count: fmt(rls), rate: pct(rlsRate), target: "> 98.00%", status: rlsRate >= 98 ? "meets" as const : "miss" as const },
    { label: "ILS", count: fmt(ils), rate: pct(ilsPercent), target: "> 99.50%", status: ilsPercent >= 99.5 ? "meets" as const : "miss" as const },
    { label: "CODE 85", count: fmt(code85), rate: pct(code85Rate), target: "< 0.200%", status: code85Rate < 0.2 ? "meets" as const : "watch" as const },
    { label: "ALL CODES", count: fmt(allCodes), rate: pct(allCodesRate), target: "< 0.200%", status: allCodesRate < 0.2 ? "meets" as const : "miss" as const },
    { label: "DNA", count: fmt(dna), rate: pct(dnaRate), target: "< 1.500%", status: dnaRate < 1.5 ? "meets" as const : "miss" as const },
    { label: "EXCEPTIONS", count: fmt(exceptions), rate: pct(exceptionRate), target: "n/a", status: "na" as const },
  ];

  const identity = payload?.company_identity ?? null;
  const terminalIdentity =
    summary?.terminal_code ||
    String(row.terminal_identity ?? "") ||
    identity?.terminal_identity ||
    "Pending";

  const serviceArea = identity?.service_area?.trim() || "Pending";

  const reportMeta = [
    ["Service date", dateLabel(selectedDate)],
    ["Source", summary ? "DSW FINAL" : "Awaiting FINAL"],
    ["Terminal", terminalIdentity],
    ["Service area", serviceArea],
    ["Generated", summary?.created_at ? new Date(summary.created_at).toLocaleString() : "Pending"],
  ];

  return (
    <section
      className="daily-operations-layout"
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) minmax(190px, 224px)",
        gap: 14,
        alignItems: "start",
      }}
    >
      <section style={{ border: "1px solid #d7e2f2", borderRadius: 18, background: "#fff", padding: 16, boxShadow: "0 16px 32px rgba(15, 23, 42, 0.04)" }}>
          <header style={{ borderBottom: "1px solid #e2e8f0", paddingBottom: 10, marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 16 }}>
              <div style={{ display: "grid", gap: 2 }}>
                <h2 style={{ margin: 0, fontSize: 22 }}>{payload?.company_name ?? "Company"}</h2>
                <div style={{ fontSize: 18, fontWeight: 750, color: "#475569" }}>Daily Operations Brief</div>
              </div>
              <button className="button" type="button" disabled={!summary} onClick={() => { setShareStatus(null); setShareOpen(true); }}>Share report</button>
            </div>

            <div className="daily-operations-meta" style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 8, marginTop: 12 }}>
              {reportMeta.map(([label, value]) => (
                <div key={label} style={{ borderLeft: "3px solid #d7e2f2", paddingLeft: 8 }}>
                  <div style={{ color: "#64748b", fontSize: 10, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
                  <strong style={{ color: "#0f172a", fontSize: 12 }}>{value}</strong>
                </div>
              ))}
            </div>
          </header>

          {error ? <p style={{ color: "#c62828", fontWeight: 900 }}>{error}</p> : null}

          {!summary ? (
            <ReportSection title="Report artifact">
              <strong>No FINAL DSW artifact found for {selectedDate}.</strong>
            </ReportSection>
          ) : (
            <div style={{ display: "grid", gap: 14 }}>
              <section className="daily-operations-kpis" style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 9 }}>
                <KpiCard label="Routes" value={fmt(routes)} detail="Routes represented in FINAL DSW" />
                <KpiCard label="Delivery stops" value={`${fmt(actDelStops)} / ${fmt(delStops)}`} detail={`Actual / planned · ${fmt(diff)} stop gap`} tone={actDelStops >= delStops ? "good" : "watch"} />
                <KpiCard label="Delivery packages" value={`${fmt(actDelPkgs)} / ${fmt(vscan)}`} detail="Completed / tendered" tone={actDelPkgs >= vscan ? "good" : "data"} />
                <KpiCard label="Pickups" value={`${fmt(actPuStops)} / ${fmt(puStops)}`} detail={`${fmt(actPuPkgs)} packages · ${pickupVariance >= 0 ? "+" : ""}${fmt(pickupVariance)} stops`} tone={potentialMissedPickups ? "risk" : pickupVariance < 0 ? "watch" : "good"} />
                <KpiCard label="ILS" value={`${fmt(ilsPercent, 1)}%`} detail={`${fmt(ils)} impact packages`} tone={ilsPercent >= 99.5 ? "good" : "risk"} />
                <KpiCard label="Express" value={`${fmt(express.open_package_count)} open`} detail={`${fmt(express.tracking_gap_package_count)} gaps / ${fmt(express.package_count)} total`} tone={express.open_package_count ? "watch" : express.tracking_gap_package_count ? "risk" : "good"} />
              </section>

              <ReportSection title="Time-critical execution">
                <div className="daily-operations-critical" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
                  <SignalRow tone={express.open_package_count ? "watch" : "clear"} title={`Express · ${fmt(express.completed_package_count)} of ${fmt(express.package_count)} delivered or provisionally delivered`} detail={`${fmt(express.open_package_count)} manifest-linked incomplete packages. Incomplete status and tracking-link gaps remain separate.`} />
                  <SignalRow tone={express.tracking_gap_package_count ? "risk" : "clear"} title={`Express tracking · ${fmt(express.tracking_gap_package_count)} gaps`} detail="A tracking gap is not presumed to be an undelivered package; it requires evidence review." />
                  <SignalRow tone={earlyLatePickups ? "watch" : "clear"} title={`Pickup timing · ${fmt(earlyLatePickups)} early / late`} detail="DSW E/L pickup events that need timing review." />
                  <SignalRow tone={potentialMissedPickups ? "risk" : "clear"} title={`Potential missed pickups · ${fmt(potentialMissedPickups)}`} detail="DSW potential-miss signal. Validate against pickup execution before closing." />
                  <SignalRow tone={pickupVariance < 0 ? "watch" : "clear"} title={`Pickup coverage · ${fmt(actPuStops)} actual / ${fmt(puStops)} planned`} detail={`${pickupVariance >= 0 ? "+" : ""}${fmt(pickupVariance)} stop variance; ${fmt(actPuPkgs)} pickup packages.`} />
                  <SignalRow tone={openWatchlist.length ? "watch" : "clear"} title={`Actionable watchlist · ${fmt(openWatchlist.length)} open`} detail={`${fmt(resolvedWatchlist.length)} resolved or dismissed items recorded for this service date.`} />
                </div>
              </ReportSection>

              <ReportSection title="Route Performance">
                <RoutePerformanceGraph
                  routeCount={routes}
                  rows={[
                    { label: "Delivery packages", planned: vscan, actual: actDelPkgs, tone: "packages" },
                    { label: "Delivery stops", planned: delStops, actual: actDelStops, tone: "stops" },
                    { label: "Pickup stops", planned: puStops, actual: actPuStops, tone: "pickups" },
                  ]}
                />
                <div className="ops-route-density">
                  <span className="ops-route-density--packages"><small>Tendered packages / route</small><strong>{fmt(avgVscan, 1)}</strong></span>
                  <span className="ops-route-density--packages"><small>Actual packages / route</small><strong>{fmt(avgActDelPkgs, 1)}</strong></span>
                  <span className="ops-route-density--stops"><small>Planned stops / route</small><strong>{fmt(avgDelStops, 1)}</strong></span>
                  <span className="ops-route-density--stops"><small>Actual stops / route</small><strong>{fmt(avgActDelStops, 1)}</strong></span>
                  <span className="ops-route-density--pickups"><small>Pickup packages / route</small><strong>{fmt(avgActPuPkgs, 1)}</strong></span>
                </div>
              </ReportSection>

              <section className="daily-operations-pair" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <ReportSection title="Code Performance">
                  <CodePerformanceGrid rows={codeRows} />
                </ReportSection>

                <ReportSection title="Watchlist">
                  <div style={{ display: "grid", gap: 8 }}>
                    {watchlistError ? <div style={{ color: "#b91c1c", fontWeight: 800, fontSize: 12 }}>{watchlistError}</div> : null}
                    {openWatchlist.length ? openWatchlist.map((item) => {
                      const tone = item.severity === "CRITICAL" ? { border: "#ef4444", bg: "#fef2f2" } : item.severity === "RISK" ? { border: "#f59e0b", bg: "#fffbeb" } : { border: "#60a5fa", bg: "#eff6ff" };
                      return (
                        <button key={item.id} type="button" onClick={() => setSelectedItemId(item.id)} style={{ width: "100%", textAlign: "left", border: `1px solid ${tone.border}`, borderLeftWidth: 5, borderRadius: 12, padding: "10px 11px", background: tone.bg, cursor: "pointer" }}>
                          <span style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                            <strong style={{ color: "#0f172a" }}>{item.title}</strong>
                            <span style={{ color: "#475569", fontSize: 10, fontWeight: 950, textTransform: "uppercase" }}>{prettyStatus(item.status)}</span>
                          </span>
                          <span style={{ display: "block", color: "#475569", fontSize: 11, marginTop: 3 }}>{item.detail}</span>
                          <span style={{ display: "block", color: "#64748b", fontSize: 10, marginTop: 6 }}>Owner: {item.assigned_to_name ?? "Unassigned"} · {item.notes.length} action note{item.notes.length === 1 ? "" : "s"}</span>
                        </button>
                      );
                    }) : (
                      <div style={{ border: "1px dashed #86efac", borderRadius: 12, padding: "10px 11px", background: "#f0fdf4", color: "#166534", fontSize: 12 }}>
                        <strong style={{ display: "block" }}>No open operational concerns.</strong>
                        The FINAL report has no materialized Express, pickup, or service-quality signals requiring action.
                      </div>
                    )}
                  </div>
                </ReportSection>
              </section>

              <ReportSection title="Actions taken and resolutions">
                {watchlist.flatMap((item) => item.notes.filter((note) => note.client_visible && ["ACTION", "RESOLUTION", "CORRECTION"].includes(note.note_type)).map((note) => ({ item, note }))).length ? (
                  <div style={{ display: "grid", gap: 7 }}>
                    {watchlist.flatMap((item) => item.notes.filter((note) => note.client_visible && ["ACTION", "RESOLUTION", "CORRECTION"].includes(note.note_type)).map((note) => ({ item, note }))).slice(0, 8).map(({ item, note }) => (
                      <button key={note.id} type="button" onClick={() => setSelectedItemId(item.id)} style={{ display: "grid", gridTemplateColumns: "150px 1fr auto", gap: 12, alignItems: "center", border: 0, borderBottom: "1px solid #e2e8f0", background: "transparent", padding: "8px 0", textAlign: "left", cursor: "pointer" }}>
                        <strong style={{ color: "#0f172a", fontSize: 12 }}>{item.title}</strong>
                        <span style={{ color: "#475569", fontSize: 12 }}>{note.body}</span>
                        <span style={{ color: "#64748b", fontSize: 10 }}>{prettyStatus(note.note_type)}</span>
                      </button>
                    ))}
                  </div>
                ) : <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>No client-visible actions have been recorded for this service date.</p>}
              </ReportSection>

              <ReportSection title="Dispatch actions">
                {payload.dispatch_actions.length ? (
                  <div className="daily-operations-dispatch-log">
                    {rollupDispatchActions(payload.dispatch_actions).map((group) => {
                      const authors = Array.from(new Set(group.actions.map((action) => action.created_by_name ?? "Dispatch")));
                      return (
                        <article key={group.key} className="daily-operations-dispatch-block">
                          <div className="daily-operations-dispatch-title">
                            <strong>{group.label}</strong>
                            <span>{prettyStatus(group.category)}</span>
                          </div>
                          <strong className="daily-operations-dispatch-count">{group.actions.length}</strong>
                          <p>{group.contexts.length ? group.contexts.join(" · ") : "Operational event"}</p>
                          {group.notes.length ? <p className="daily-operations-dispatch-note">{group.notes.join(" · ")}</p> : null}
                          <footer>{dispatchTimeRange(group.actions)} · {authors.join(", ")}</footer>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>
                    No dispatch actions were recorded for this service date.
                  </p>
                )}
              </ReportSection>


              <footer style={{ borderTop: "1px solid #d7e2f2", paddingTop: 6, color: "#64748b", fontSize: 11, fontStyle: "italic", textAlign: "center" }}>
                Disclaimer: The P&amp;D results section reflects pickup and delivery data as recorded through the source artifact and does not reflect later reconciliation adjustments.
              </footer>
            </div>
          )}
        </section>

        <aside style={{ position: "sticky", top: 12 }}>
          <section style={{ border: "1px solid #d7e2f2", borderRadius: 16, background: "#fff", padding: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <button className="button" type="button" onClick={() => setVisibleMonth(addMonths(visibleMonth, -1))} style={{ width: 30, height: 30, padding: 0 }}>‹</button>
              <strong style={{ fontSize: 12, color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em" }}>{monthLabel(visibleMonth)}</strong>
              <button className="button" type="button" onClick={() => setVisibleMonth(addMonths(visibleMonth, 1))} style={{ width: 30, height: 30, padding: 0 }}>›</button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, fontSize: 10, color: "#64748b", fontWeight: 900 }}>
              {["S", "U", "M", "T", "W", "H", "F"].map((d, index) => (
                <span key={`${d}-${index}`} style={{ textAlign: "center" }}>{d}</span>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginTop: 4 }}>
              {calendarCells(visibleMonth).map((dateIso, index) => {
                const inMonth = dateIso.slice(0, 7) === visibleMonth.slice(0, 7);
                const status = calendarMap.get(dateIso) ?? "empty";
                const isWeekendColumn = index % 7 <= 1;

                return (
                  <button
                    key={dateIso}
                    type="button"
                    disabled={!inMonth}
                    onClick={() => setSelectedDate(dateIso)}
                    style={{
                      ...statusStyle(status, selectedDate === dateIso),
                      boxShadow: isWeekendColumn ? "inset 0 0 0 999px rgba(15, 23, 42, 0.025)" : undefined,
                      opacity: inMonth ? 1 : 0.22,
                    }}
                  >
                    {Number(dateIso.slice(-2))}
                  </button>
                );
              })}
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "end",
                gap: 8,
                marginTop: 10,
              }}
            >
              <div style={{ display: "grid", gap: 4, color: "#64748b", fontSize: 11, fontWeight: 800 }}>
                <span>🟢 Final report</span>
                <span>🟠 In-day only</span>
                <span>⚪ No record</span>
              </div>

              <button
                type="button"
                className="button"
                onClick={() => {
                  const today = new Date().toISOString().slice(0, 10);
                  setSelectedDate(today);
                  setVisibleMonth(today);
                }}
                style={{
                  minHeight: 28,
                  padding: "0 9px",
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 900,
                  whiteSpace: "nowrap",
                }}
              >
                Today
              </button>
            </div>
          </section>
      </aside>
      {selectedWatchlistItem ? (
        <WatchlistDrawer
          key={selectedWatchlistItem.id}
          item={selectedWatchlistItem}
          assignees={assignees}
          busy={watchlistBusy}
          onClose={() => setSelectedItemId(null)}
          onUpdate={(values) => updateWatchlistItem(selectedWatchlistItem, values)}
          onAddNote={(body, noteType, visible) => addWatchlistNote(selectedWatchlistItem.id, body, noteType, visible)}
        />
      ) : null}
      {shareOpen ? (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(15,23,42,.44)", display: "grid", placeItems: "center", padding: 20 }} onMouseDown={() => setShareOpen(false)}>
          <section onMouseDown={(event) => event.stopPropagation()} style={{ width: "min(520px, 100%)", borderRadius: 20, background: "#fff", padding: 22, boxShadow: "0 30px 80px rgba(15,23,42,.25)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div><div style={{ color: "#059669", fontSize: 11, fontWeight: 950, textTransform: "uppercase", letterSpacing: ".1em" }}>Governed report share</div><h2 style={{ margin: "5px 0 0" }}>Email Daily Operations Brief</h2></div>
              <button className="button" type="button" onClick={() => setShareOpen(false)} style={{ width: 40, height: 40, padding: 0 }}>×</button>
            </div>
            <p style={{ color: "#64748b" }}>A snapshot of the FINAL report, Express posture, and client-visible action state will be recorded at send time.</p>
            <label style={{ display: "grid", gap: 5, fontWeight: 800, color: "#334155" }}>Recipients
              <input type="text" value={shareRecipients} onChange={(event) => setShareRecipients(event.target.value)} placeholder="name@example.com, leader@example.com" />
            </label>
            <label style={{ display: "grid", gap: 5, fontWeight: 800, color: "#334155", marginTop: 12 }}>Message (optional)
              <textarea rows={4} value={shareMessage} onChange={(event) => setShareMessage(event.target.value)} placeholder="Add context for the operating team…" />
            </label>
            {shareStatus ? <p style={{ color: shareStatus.startsWith("Sent") ? "#166534" : "#b91c1c", fontWeight: 800 }}>{shareStatus}</p> : null}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 9, marginTop: 16 }}>
              <button className="button" type="button" onClick={() => setShareOpen(false)}>Cancel</button>
              <button className="button buttonPrimary" type="button" disabled={shareBusy || !shareRecipients.trim()} onClick={shareReport}>{shareBusy ? "Sending…" : "Send report"}</button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
