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

type OnboardingPayload = {
  has_session: boolean;
  session_id: string | null;
  session_status: string | null;
  onboarding_completed_at: string | null;
  progress_pct: number;
  current_step: string | null;
  steps: Array<{
    step_key: string;
    label: string;
    step_order: number;
    completed: boolean;
    completed_at: string | null;
  }>;
};

function formatOptionalDate(value: string | null) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export default function CandidateStatusCard(props: {
  candidate: CandidateRecord | null;
  onboarding: OnboardingPayload | null;
  loading: boolean;
}) {
  const { candidate, onboarding, loading } = props;

  const stageLabel =
    candidate?.employment_status === "Active"
      ? "Active"
      : candidate?.onboarding_completed_at || onboarding?.session_status === "completed"
        ? "Ready for Activation"
        : onboarding?.has_session
          ? "Onboarding"
          : candidate?.invite_status === "Invited"
            ? "Invited"
            : "Candidate Created";

  return (
    <article className="value-card">
      <p className="value-card__eyebrow">Status</p>
      <h3 className="value-card__title">Hiring posture</h3>

      {loading ? (
        <p className="value-card__body">Loading status...</p>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          <div className="hero-stat">
            <span className="hero-stat__label">Employment status</span>
            <strong>{candidate?.employment_status ?? "—"}</strong>
          </div>

          <div className="hero-stat">
            <span className="hero-stat__label">Invite status</span>
            <strong>{candidate?.invite_status ?? "—"}</strong>
          </div>

          <div className="hero-stat">
            <span className="hero-stat__label">Compliance posture</span>
            <strong>{candidate?.compliance_summary ?? "—"}</strong>
          </div>

          <div className="hero-stat">
            <span className="hero-stat__label">Current stage</span>
            <strong>{stageLabel}</strong>
          </div>

          <div className="hero-stat">
            <span className="hero-stat__label">Onboarding completed</span>
            <strong>
              {formatOptionalDate(candidate?.onboarding_completed_at ?? null)}
            </strong>
          </div>
        </div>
      )}
    </article>
  );
}