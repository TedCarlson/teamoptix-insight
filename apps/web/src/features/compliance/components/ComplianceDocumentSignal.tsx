"use client";

type DocumentIconKey =
  | "drivers_license"
  | "tsa_background"
  | "background_check"
  | "dot_medical"
  | "drug_test"
  | "employment_form"
  | "interview"
  | "generic";

type Props = {
  iconKey?: string | null;
  label: string;
  ready?: boolean;
  expiresAt?: string | null;
  warningDays?: number;
  compact?: boolean;
};

function daysUntil(value: string | null | undefined) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);

  return Math.ceil((date.getTime() - today.getTime()) / 86_400_000);
}

function normalizeIconKey(value: string | null | undefined): DocumentIconKey {
  const key = (value ?? "").toLowerCase();

  if (key.includes("driver") || key.includes("license")) return "drivers_license";
  if (key.includes("tsa")) return "tsa_background";
  if (key.includes("background") || key.includes("bg")) return "background_check";
  if (key.includes("dot") || key.includes("medical")) return "dot_medical";
  if (key.includes("drug") || key.includes("dt")) return "drug_test";
  if (key.includes("employment") || key.includes("form")) return "employment_form";
  if (key.includes("interview")) return "interview";

  return "generic";
}

function toneFor(props: {
  ready: boolean;
  expiresAt?: string | null;
  warningDays: number;
}) {
  const days = daysUntil(props.expiresAt);

  if (!props.ready) {
    return {
      state: "Not ready",
      bg: "#f8fafc",
      border: "#dbe4ef",
      text: "#475569",
      icon: "#64748b",
      meta: "Missing",
    };
  }

  if (days !== null && days < 0) {
    return {
      state: "Expired",
      bg: "#fef2f2",
      border: "#fecaca",
      text: "#991b1b",
      icon: "#dc2626",
      meta: "Expired",
    };
  }

  if (days !== null && days <= props.warningDays) {
    return {
      state: "Expiring",
      bg: "#fffbeb",
      border: "#fde68a",
      text: "#92400e",
      icon: "#f59e0b",
      meta: `${days}d left`,
    };
  }

  return {
    state: "Ready",
    bg: "#ecfdf3",
    border: "#bbf7d0",
    text: "#166534",
    icon: "#16a34a",
    meta: "Ready",
  };
}

function Icon(props: { iconKey: DocumentIconKey; color: string }) {
  const { iconKey, color } = props;

  if (iconKey === "drivers_license") {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <rect x="3" y="5" width="18" height="14" rx="2.5" fill="none" stroke={color} strokeWidth="2" />
        <circle cx="8.2" cy="11" r="2" fill="none" stroke={color} strokeWidth="1.8" />
        <path d="M5.8 16c.7-1.7 4.1-1.7 4.8 0" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
        <path d="M13 10h5M13 14h4" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (iconKey === "tsa_background" || iconKey === "background_check") {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path d="M12 3 19 6v5c0 4.6-2.8 8.1-7 10-4.2-1.9-7-5.4-7-10V6l7-3Z" fill="none" stroke={color} strokeWidth="2" />
        <path d="m8.5 12 2.2 2.2 4.8-5" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (iconKey === "dot_medical") {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path d="M12 21s-7-4.4-7-11a4 4 0 0 1 7-2.7A4 4 0 0 1 19 10c0 6.6-7 11-7 11Z" fill="none" stroke={color} strokeWidth="2" />
        <path d="M12 8v7M8.5 11.5h7" stroke={color} strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  if (iconKey === "drug_test") {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path d="M9 3h6M10 3v5l-4.6 8A3.3 3.3 0 0 0 8.3 21h7.4a3.3 3.3 0 0 0 2.9-5L14 8V3" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
        <path d="M7.3 16h9.4" stroke={color} strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  if (iconKey === "employment_form") {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path d="M7 3h7l4 4v14H7V3Z" fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
        <path d="M14 3v5h5M9.5 12h5M9.5 16h5" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (iconKey === "interview") {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path d="M5 6h14v9H9l-4 3V6Z" fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
        <path d="M8.5 10h7M8.5 13h4" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path d="M7 3h7l4 4v14H7V3Z" fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      <path d="M9.5 13h5M9.5 17h5" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default function ComplianceDocumentSignal({
  iconKey,
  label,
  ready = false,
  expiresAt = null,
  warningDays = 30,
  compact = false,
}: Props) {
  const normalizedIconKey = normalizeIconKey(iconKey ?? label);
  const tone = toneFor({ ready, expiresAt, warningDays });

  return (
    <span
      title={`${label}: ${tone.state}${expiresAt ? ` · expires ${expiresAt}` : ""}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: compact ? 6 : 8,
        minHeight: compact ? 28 : 34,
        padding: compact ? "3px 8px" : "5px 10px",
        borderRadius: 999,
        border: `1px solid ${tone.border}`,
        background: tone.bg,
        color: tone.text,
        fontSize: compact ? 12 : 13,
        fontWeight: 900,
        whiteSpace: "nowrap",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,.75)",
      }}
    >
      <Icon iconKey={normalizedIconKey} color={tone.icon} />
      <span>{label}</span>
      <span
        style={{
          fontSize: compact ? 11 : 12,
          color: tone.text,
          opacity: 0.82,
        }}
      >
        {tone.meta}
      </span>
    </span>
  );
}
