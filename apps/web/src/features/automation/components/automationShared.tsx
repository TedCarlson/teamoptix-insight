import type { ReactNode } from "react";
import type { AutomationRun } from "./automation.types";
import { formatDuration, formatTime } from "./automationFormatters";
import { mutedCopy, profileCard, reportChip, sourceBox, sourceTitle, summaryLabel, summaryLine } from "./automationStyles";

export function SectionCard(props: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <article className="app-card" style={{ padding: 14 }}>
      <p className="value-card__eyebrow">{props.eyebrow}</p>
      <h3 className="app-card__title" style={{ fontSize: 18 }}>{props.title}</h3>
      <div style={{ marginTop: 10 }}>{props.children}</div>
    </article>
  );
}

export function MiniStat(props: { label: string; value: string | number | null | undefined }) {
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

export function ProfileCard(props: {
  title: string;
  badge: string;
  tone: "blue" | "green" | "slate";
  description: string;
  reports: string[];
  footer: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      style={{
        ...profileCard,
        border: "1px solid #e6edf5",
        cursor: props.disabled
          ? "not-allowed"
          : props.onClick
            ? "pointer"
            : "default",
        opacity: props.disabled ? 0.58 : 1,
        textAlign: "left",
        width: "100%",
      }}
      onClick={props.disabled ? undefined : props.onClick}
    >
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
    </button>
  );
}

export function RunSummary(props: { title: string; run: AutomationRun | null }) {
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

export function OptionButton(props: {
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

