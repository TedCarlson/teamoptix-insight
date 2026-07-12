import {
  formatCommercialRouteRange,
  type CommercialTierEvidence,
} from "@/features/commercial/server/commercialTierEvidence.server";

type CommercialTierEvidencePanelProps = {
  evidence: CommercialTierEvidence;
};

function formatEvidenceNumber(value: number | null) {
  if (value === null) {
    return "—";
  }

  return value.toLocaleString(undefined, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function EvidenceStat(props: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div style={evidenceStat}>
      <span style={evidenceLabel}>{props.label}</span>
      <strong>{props.value}</strong>
      {props.detail ? (
        <span style={evidenceDetail}>{props.detail}</span>
      ) : null}
    </div>
  );
}

export default function CommercialTierEvidencePanel({
  evidence,
}: CommercialTierEvidencePanelProps) {
  const status =
    evidence.tierMatchesEvidence === false
      ? "Tier mismatch"
      : evidence.tierMatchesEvidence === true
        ? "Tier aligned"
        : "Evidence pending";

  return (
    <section style={panel}>
      <div style={panelHeader}>
        <div>
          <h2 style={panelTitle}>Commercial Tier Evidence</h2>
          <p style={muted}>
            Last 90 days of finalized DSW operating history used to validate
            the declared billing tier.
          </p>
        </div>

        <div
          style={
            evidence.tierMatchesEvidence === false
              ? warningPill
              : evidence.tierMatchesEvidence === true
                ? successPill
                : neutralPill
          }
        >
          {status}
        </div>
      </div>

      <div style={evidenceBody}>
        <div style={evidenceGrid}>
          <EvidenceStat
            label="30-day avg routes"
            value={formatEvidenceNumber(evidence.average30)}
          />
          <EvidenceStat
            label="60-day avg routes"
            value={formatEvidenceNumber(evidence.average60)}
          />
          <EvidenceStat
            label="90-day avg routes"
            value={formatEvidenceNumber(evidence.average90)}
          />
          <EvidenceStat
            label="Weekday avg"
            value={formatEvidenceNumber(evidence.weekdayAverage)}
          />
          <EvidenceStat
            label="Weekend avg"
            value={formatEvidenceNumber(evidence.weekendAverage)}
          />
          <EvidenceStat
            label="Peak observed"
            value={formatEvidenceNumber(evidence.peakRouteCount)}
          />
        </div>

        <div style={tierComparisonGrid}>
          <EvidenceStat
            label="Observed days"
            value={String(evidence.observedDays)}
            detail={`${evidence.startDate} → ${evidence.endDate}`}
          />
          <EvidenceStat
            label="Sustained footprint"
            value={
              evidence.sustainedRouteCount === null
                ? "—"
                : `${evidence.sustainedRouteCount} routes`
            }
            detail="Ceiling of highest 30/60/90 average"
          />
          <EvidenceStat
            label="Recommended tier"
            value={evidence.recommendedTier?.display_name ?? "—"}
            detail={formatCommercialRouteRange(evidence.recommendedTier)}
          />
          <EvidenceStat
            label="Declared tier"
            value={evidence.declaredTier?.display_name ?? "—"}
            detail={formatCommercialRouteRange(evidence.declaredTier)}
          />
        </div>

        {evidence.loadError ? (
          <p style={warningText}>
            Tier evidence could not load from analytics: {evidence.loadError}
          </p>
        ) : null}

        {evidence.tierMatchesEvidence === false ? (
          <p style={warningText}>
            The declared commercial tier does not cover the observed route
            footprint. Review the tier assignment before advancing billing
            approval.
          </p>
        ) : null}

        {evidence.observedDays === 0 && !evidence.loadError ? (
          <p style={warningText}>
            No finalized operating history was found for the last 90 days. Tier
            validation cannot be completed from analytics evidence yet.
          </p>
        ) : null}
      </div>
    </section>
  );
}

const panel = {
  border: "1px solid #dbe3ef",
  borderRadius: 14,
  background: "#fff",
  overflow: "hidden",
};

const panelHeader = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 16,
  padding: "16px 18px",
  borderBottom: "1px solid #e2e8f0",
};

const panelTitle = {
  margin: 0,
  color: "#0f172a",
  fontSize: 18,
};

const muted = {
  margin: "4px 0 0",
  color: "#64748b",
};

const evidenceBody = {
  display: "grid",
  gap: 12,
  padding: 18,
};

const evidenceGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 10,
};

const tierComparisonGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 10,
};

const evidenceStat = {
  display: "grid",
  gap: 4,
  border: "1px solid #dbe3ef",
  borderRadius: 12,
  padding: "12px 14px",
  background: "#fff",
};

const evidenceLabel = {
  color: "#64748b",
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: "0.08em",
  textTransform: "uppercase" as const,
};

const evidenceDetail = {
  color: "#64748b",
  fontSize: 12,
  fontWeight: 700,
};

const basePill = {
  borderRadius: 999,
  padding: "6px 10px",
  fontSize: 12,
  fontWeight: 900,
};

const successPill = {
  ...basePill,
  border: "1px solid #10b981",
  color: "#047857",
  background: "#ecfdf5",
};

const warningPill = {
  ...basePill,
  border: "1px solid #f59e0b",
  color: "#92400e",
  background: "#fffbeb",
};

const neutralPill = {
  ...basePill,
  border: "1px solid #cbd5e1",
  color: "#475569",
  background: "#f8fafc",
};

const warningText = {
  margin: 0,
  color: "#92400e",
  fontWeight: 800,
};
