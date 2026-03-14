import type { PersonRecord } from "@/features/people/lib/person-detail.types";

function formatOptionalDate(value: string | null) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export default function PersonStatusCard(props: {
  person: PersonRecord | null;
  loading: boolean;
  stageLabel: string;
  eyebrow?: string;
  title?: string;
}) {
  const {
    person,
    loading,
    stageLabel,
    eyebrow = "Status",
    title = "Employment posture",
  } = props;

  return (
    <article className="value-card">
      <p className="value-card__eyebrow">{eyebrow}</p>
      <h3 className="value-card__title">{title}</h3>

      {loading ? (
        <p className="value-card__body">Loading status...</p>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          <div className="hero-stat">
            <span className="hero-stat__label">Employment status</span>
            <strong>{person?.employment_status ?? "—"}</strong>
          </div>

          <div className="hero-stat">
            <span className="hero-stat__label">Compliance posture</span>
            <strong>{person?.compliance_summary ?? "—"}</strong>
          </div>

          <div className="hero-stat">
            <span className="hero-stat__label">Current stage</span>
            <strong>{stageLabel}</strong>
          </div>

          <div className="hero-stat">
            <span className="hero-stat__label">Reports to</span>
            <strong>{person?.reports_to_name ?? "—"}</strong>
          </div>

          <div className="hero-stat">
            <span className="hero-stat__label">Start date</span>
            <strong>{person?.hire_date ?? "—"}</strong>
          </div>

          <div className="hero-stat">
            <span className="hero-stat__label">Onboarding completed</span>
            <strong>
              {formatOptionalDate(person?.onboarding_completed_at ?? null)}
            </strong>
          </div>
        </div>
      )}
    </article>
  );
}