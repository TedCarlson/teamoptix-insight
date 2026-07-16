import type { RosterComplianceSignal } from "@/features/compliance/lib/rosterCompliance";

const icon: Record<RosterComplianceSignal["documentType"], string> = {
  driver_license: "🪪",
  dot_medical: "🩺",
  qualification_certificate: "📜",
};

export default function RosterComplianceIndicators({ signals }: { signals: RosterComplianceSignal[] }) {
  if (signals.length === 0) {
    return (
      <span
        aria-label="Compliance documents are current"
        title="Compliance documents are current"
        style={{ color: "#16803c", fontSize: 15, fontWeight: 900 }}
      >
        ✓
      </span>
    );
  }
  return (
    <span style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {signals.map((signal) => (
        <span
          key={signal.documentType}
          title={`${signal.label}: ${signal.status}`}
          style={{ color: signal.severity === "red" ? "#b42318" : signal.severity === "orange" ? "#b54708" : "#946200", fontSize: 12, fontWeight: 800, whiteSpace: "nowrap" }}
        >
          <span aria-hidden="true">{icon[signal.documentType]}</span>{" "}
          {signal.status === "expired" ? "Expired" : signal.status === "missing" ? signal.label : `${signal.daysRemaining}d`}
        </span>
      ))}
    </span>
  );
}
