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

export default function CandidateActionsCard(props: {
  candidate: CandidateRecord | null;
  onboarding: OnboardingPayload | null;
  loadingCandidate: boolean;
  inviting: boolean;
  activating: boolean;
  onSendInvite: () => void;
  onActivate: () => void;
}) {
  const {
    candidate,
    onboarding,
    loadingCandidate,
    inviting,
    activating,
    onSendInvite,
    onActivate,
  } = props;

  const canInvite =
    candidate?.employment_status === "Candidate" &&
    candidate?.invite_status !== "Invited" &&
    !onboarding?.has_session;

  const canActivate =
    candidate?.employment_status === "Candidate" &&
    Boolean(candidate?.onboarding_completed_at);

  return (
    <article className="value-card">
      <p className="value-card__eyebrow">Actions</p>
      <h3 className="value-card__title">Next actions</h3>

      <div className="cta-row">
        <button
          className="button"
          type="button"
          disabled={!canInvite || inviting}
          onClick={onSendInvite}
        >
          {inviting
            ? "Sending..."
            : candidate?.invite_status === "Invited"
              ? "Invited"
              : "Send invite"}
        </button>

        <button className="button" type="button">
          Move stage
        </button>

        <button className="button" type="button">
          Add note
        </button>

        {canActivate ? (
          <button
            className="button button-primary"
            type="button"
            disabled={activating}
            onClick={onActivate}
          >
            {activating ? "Activating..." : "Activate Candidate"}
          </button>
        ) : null}
      </div>

      {!loadingCandidate && candidate ? (
        <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
          <div className="hero-stat">
            <span className="hero-stat__label">Reports to</span>
            <strong>{candidate.reports_to_name}</strong>
          </div>

          <div className="hero-stat">
            <span className="hero-stat__label">Start date</span>
            <strong>{candidate.hire_date}</strong>
          </div>
        </div>
      ) : null}
    </article>
  );
}