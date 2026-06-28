import type { CandidateRecord } from "@/features/hiring/lib/candidate-detail.types";

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
            <span className="hero-stat__label">Email</span>
            <strong style={{ wordBreak: "break-word", lineHeight: 1.35 }}>
              {candidate?.email ?? "—"}
            </strong>
          </div>

          <div className="hero-stat">
            <span className="hero-stat__label">Phone</span>
            <strong>{candidate?.phone ?? "—"}</strong>
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
