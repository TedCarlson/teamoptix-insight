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

export default function CandidateIdentityCard(props: {
  candidate: CandidateRecord | null;
  loading: boolean;
  rosterId: string;
}) {
  const { candidate, loading, rosterId } = props;

  return (
    <article className="value-card">
      <p className="value-card__eyebrow">Candidate</p>
      <h3 className="value-card__title">Candidate identity</h3>

      {loading ? (
        <p className="value-card__body">Loading candidate...</p>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          <div className="hero-stat">
            <span className="hero-stat__label">Display name</span>
            <strong>{candidate?.full_name ?? "—"}</strong>
          </div>

          <div className="hero-stat">
            <span className="hero-stat__label">Roster ID</span>
            <strong style={{ wordBreak: "break-word", lineHeight: 1.35 }}>
              {candidate?.id ?? rosterId}
            </strong>
          </div>

          <div className="hero-stat">
            <span className="hero-stat__label">Role focus</span>
            <strong>{candidate?.worker_type ?? "—"}</strong>
          </div>

          <div className="hero-stat">
            <span className="hero-stat__label">Market</span>
            <strong>{candidate?.market_code ?? "—"}</strong>
          </div>
        </div>
      )}
    </article>
  );
}