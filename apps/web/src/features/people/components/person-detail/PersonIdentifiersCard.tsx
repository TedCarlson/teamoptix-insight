import type { PersonRecord } from "@/features/people/lib/person-detail.types";

export default function PersonIdentifiersCard(props: {
  person: PersonRecord | null;
  loading: boolean;
  eyebrow?: string;
  title?: string;
}) {
  const {
    person,
    loading,
    eyebrow = "Identifiers",
    title = "Operational bridge fields",
  } = props;

  return (
    <article className="value-card">
      <p className="value-card__eyebrow">{eyebrow}</p>
      <h3 className="value-card__title">{title}</h3>

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
            <strong>{person?.employment_status ?? "—"}</strong>
          </div>
        </div>
      )}
    </article>
  );
}