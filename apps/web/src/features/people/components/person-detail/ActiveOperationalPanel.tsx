import type { PersonRecord } from "@/features/people/lib/person-detail.types";

export default function ActiveOperationalPanel(props: {
  person: PersonRecord | null;
  loading: boolean;
}) {
  const { person, loading } = props;

  return (
    <article className="value-card" style={{ gridColumn: "1 / span 2" }}>
      <p className="value-card__eyebrow">Operations</p>
      <h3 className="value-card__title">Active workforce posture</h3>
      <p className="value-card__body" style={{ marginTop: 8 }}>
        Operational status for an active worker. This is the shared workforce
        view for assignment, compliance, and management posture.
      </p>

      {loading ? (
        <div style={{ paddingTop: 16 }}>Loading active posture...</div>
      ) : (
        <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
          <div className="hero-stat">
            <span className="hero-stat__label">Workforce status</span>
            <strong>{person?.employment_status ?? "—"}</strong>
          </div>

          <div className="hero-stat">
            <span className="hero-stat__label">Supervisor</span>
            <strong>{person?.reports_to_name ?? "—"}</strong>
          </div>

          <div className="hero-stat">
            <span className="hero-stat__label">Compliance posture</span>
            <strong>{person?.compliance_summary ?? "—"}</strong>
          </div>

          <div className="hero-stat">
            <span className="hero-stat__label">Operational note</span>
            <strong>Future slices will add assignment, compliance, and transfer tools.</strong>
          </div>
        </div>
      )}
    </article>
  );
}