import type { PersonRecord } from "@/features/people/lib/person-detail.types";

export default function PersonIdentityCard(props: {
  person: PersonRecord | null;
  loading: boolean;
  rosterId: string;
  eyebrow?: string;
  title?: string;
}) {
  const {
    person,
    loading,
    rosterId,
    eyebrow = "Person",
    title = "Person identity",
  } = props;

  return (
    <article className="value-card">
      <p className="value-card__eyebrow">{eyebrow}</p>
      <h3 className="value-card__title">{title}</h3>

      {loading ? (
        <p className="value-card__body">Loading person...</p>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          <div className="hero-stat">
            <span className="hero-stat__label">Display name</span>
            <strong>{person?.full_name ?? "—"}</strong>
          </div>

          <div className="hero-stat">
            <span className="hero-stat__label">Email</span>
            <strong style={{ wordBreak: "break-word", lineHeight: 1.35 }}>
              {person?.email ?? "—"}
            </strong>
          </div>

          <div className="hero-stat">
            <span className="hero-stat__label">Phone</span>
            <strong>{person?.phone ?? "—"}</strong>
          </div>

          <div className="hero-stat">
            <span className="hero-stat__label">Roster ID</span>
            <strong style={{ wordBreak: "break-word", lineHeight: 1.35 }}>
              {person?.id ?? rosterId}
            </strong>
          </div>

          <div className="hero-stat">
            <span className="hero-stat__label">Worker type</span>
            <strong>{person?.worker_type ?? "—"}</strong>
          </div>

          <div className="hero-stat">
            <span className="hero-stat__label">Market</span>
            <strong>{person?.market_code ?? "—"}</strong>
          </div>
        </div>
      )}
    </article>
  );
}
