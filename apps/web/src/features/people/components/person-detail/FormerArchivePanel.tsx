import type { PersonRecord } from "@/features/people/lib/person-detail.types";

export default function FormerArchivePanel(props: {
  person: PersonRecord | null;
  loading: boolean;
}) {
  const { person, loading } = props;

  return (
    <article className="value-card" style={{ gridColumn: "1 / span 2" }}>
      <p className="value-card__eyebrow">Archive</p>
      <h3 className="value-card__title">Former workforce posture</h3>
      <p className="value-card__body" style={{ marginTop: 8 }}>
        Historical record for a former worker. This surface preserves lifecycle
        context without treating the person as active workforce.
      </p>

      {loading ? (
        <div style={{ paddingTop: 16 }}>Loading former posture...</div>
      ) : (
        <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
          <div className="hero-stat">
            <span className="hero-stat__label">Workforce status</span>
            <strong>{person?.employment_status ?? "—"}</strong>
          </div>

          <div className="hero-stat">
            <span className="hero-stat__label">Last supervisor</span>
            <strong>{person?.reports_to_name ?? "—"}</strong>
          </div>

          <div className="hero-stat">
            <span className="hero-stat__label">Final compliance posture</span>
            <strong>{person?.compliance_summary ?? "—"}</strong>
          </div>

          <div className="hero-stat">
            <span className="hero-stat__label">Archive note</span>
            <strong>Future slices will add restore, rehire, and separation details.</strong>
          </div>
        </div>
      )}
    </article>
  );
}