import CandidateContactEditor from "./CandidateContactEditor";
import type { CandidateRecord } from "@/features/hiring/lib/candidate-detail.types";

type CandidateDetailsPanelProps = {
  slug: string;
  rosterId: string;
  candidate: CandidateRecord | null;
  loading: boolean;
  onSaved: React.Dispatch<React.SetStateAction<CandidateRecord | null>>;
};

function DetailRow(props: {
  label: string;
  value: string | null | undefined;
  muted?: boolean;
}) {
  const { label, value, muted = false } = props;

  return (
    <div className="hero-stat">
      <span className="hero-stat__label">{label}</span>
      <strong style={muted ? { color: "#64748b" } : undefined}>
        {value || "—"}
      </strong>
    </div>
  );
}

export default function CandidateDetailsPanel(props: CandidateDetailsPanelProps) {
  const { slug, rosterId, candidate, loading, onSaved } = props;

  return (
    <article className="value-card" style={{ gridColumn: "1 / span 2" }}>
      <p className="value-card__eyebrow">Details</p>
      <h3 className="value-card__title">Candidate record</h3>
      <p className="value-card__body" style={{ marginTop: 8 }}>
        Manage the candidate details used for contact, hiring review, and onboarding.
        System IDs stay visible but out of the way.
      </p>

      {loading ? (
        <p className="value-card__body" style={{ marginTop: 14 }}>
          Loading candidate details...
        </p>
      ) : (
        <div style={{ marginTop: 16, display: "grid", gap: 14 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 10,
            }}
          >
            <DetailRow label="Display name" value={candidate?.full_name} />
            <DetailRow label="Role focus" value={candidate?.worker_type} />
            <DetailRow label="Market" value={candidate?.market_code} />
            <DetailRow label="Reports to" value={candidate?.reports_to_name} />
            <DetailRow label="Start date" value={candidate?.hire_date} />
            <DetailRow label="Roster ID" value={rosterId} muted />
          </div>

          <div
            style={{
              borderTop: "1px solid #e6edf5",
              paddingTop: 14,
            }}
          >
            <CandidateContactEditor
              slug={slug}
              candidate={candidate}
              loading={loading}
              onSaved={onSaved}
            />
          </div>
        </div>
      )}
    </article>
  );
}
