"use client";

type ComplianceTone = {
  icon: string;
  label: string;
  bg: string;
  border: string;
  text: string;
};

function complianceTone(value: string | null | undefined): ComplianceTone {
  const normalized = (value ?? "").toLowerCase();

  if (normalized.includes("expired")) {
    return {
      icon: "⛔",
      label: value ?? "Expired",
      bg: "#fef2f2",
      border: "#fecaca",
      text: "#991b1b",
    };
  }

  if (normalized.includes("expiring") || normalized.includes("soon")) {
    return {
      icon: "⚠️",
      label: value ?? "Expiring Soon",
      bg: "#fffbeb",
      border: "#fde68a",
      text: "#92400e",
    };
  }

  if (normalized.includes("compliant") || normalized.includes("complete")) {
    return {
      icon: "✅",
      label: value ?? "Compliant",
      bg: "#ecfdf3",
      border: "#bbf7d0",
      text: "#166534",
    };
  }

  return {
    icon: "❌",
    label: value || "Missing",
    bg: "#fff7ed",
    border: "#fed7aa",
    text: "#b54708",
  };
}

export default function ComplianceSignal(props: {
  value: string | null | undefined;
  compact?: boolean;
}) {
  const tone = complianceTone(props.value);

  return (
    <span
      title={tone.label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: props.compact ? 5 : 7,
        minHeight: props.compact ? 24 : 28,
        padding: props.compact ? "2px 8px" : "3px 10px",
        borderRadius: 999,
        border: `1px solid ${tone.border}`,
        background: tone.bg,
        color: tone.text,
        fontSize: props.compact ? 12 : 13,
        fontWeight: 900,
        whiteSpace: "nowrap",
      }}
    >
      <span aria-hidden="true">{tone.icon}</span>
      <span>{tone.label}</span>
    </span>
  );
}
