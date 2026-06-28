import type { PersonRecord } from "@/features/people/lib/person-detail.types";

type PersonStatus = "Candidate" | "Active" | "Former";

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
  submitting?: boolean;
  onChangeStatus?: (status: PersonStatus) => void;
}) {
  const {
    person,
    loading,
    stageLabel,
    eyebrow = "Status",
    title = "Employment posture",
    submitting = false,
    onChangeStatus,
  } = props;

  const currentStatus = person?.employment_status ?? null;
  const statusOptions: PersonStatus[] = ["Candidate", "Active", "Former"];

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
            <strong>{currentStatus ?? "—"}</strong>
          </div>

          {currentStatus === "Former" ? (
            <div className="hero-stat">
              <span className="hero-stat__label">Separation date</span>
              <strong>{person?.separation_date ?? "—"}</strong>
            </div>
          ) : null}

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

          {onChangeStatus ? (
            <div style={{ display: "grid", gap: 8, marginTop: 6 }}>
              <p className="value-card__eyebrow" style={{ margin: 0 }}>
                Status workflow
              </p>

              <div className="cta-row" style={{ marginTop: 0 }}>
                {statusOptions.map((status) => (
                  <button
                    key={status}
                    className={status === currentStatus ? "button button-primary" : "button"}
                    type="button"
                    disabled={submitting || status === currentStatus}
                    onClick={() => onChangeStatus(status)}
                  >
                    {status === currentStatus ? status : `Move to ${status}`}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </article>
  );
}
