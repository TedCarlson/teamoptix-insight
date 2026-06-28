type CandidateRecord = {
  id: string;
  full_name: string;
  worker_type: string;
  employment_status: "Active" | "Candidate" | "Former";
  market_code: string;
  reports_to_name: string;
  hire_date: string;
  invite_status: string;
  compliance_summary: string;
  onboarding_completed_at: string | null;
};

export default function CandidateIdentifiersCard(props: {
  candidate: CandidateRecord | null;
  loading: boolean;
}) {
  const { candidate, loading } = props;

  return (
    <article className="value-card">
      <p className="value-card__eyebrow">Identifiers</p>
      <h3 className="value-card__title">Operational bridge fields</h3>

      {loading ? (
        <p className="value-card__body">Loading identifier posture...</p>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          <div className="hero-stat">
            <span className="hero-stat__label">FX ID</span>
            <strong>Pending identifier data surface</strong>
          </div>

          <div className="hero-stat">
            <span className="hero-stat__label">DSWID</span>
            <strong>Leadership-managed bridge field</strong>
          </div>

          <div className="hero-stat">
            <span className="hero-stat__label">Ownership rule</span>
            <strong>BC / AO maintained</strong>
          </div>

          <div className="hero-stat">
            <span className="hero-stat__label">Record scope</span>
            <strong>{candidate?.employment_status ?? "—"}</strong>
          </div>
        </div>
      )}
    </article>
  );
}