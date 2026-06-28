import type {
  CandidateRecord,
  OnboardingPayload,
} from "@/features/hiring/lib/candidate-detail.types";

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

  const hasInviteEmail = Boolean(candidate?.email && candidate.email.trim());

  const inviteStatus = (candidate?.invite_status ?? "Not Invited").toLowerCase();

  const canInvite =
    candidate?.employment_status === "Candidate" &&
    hasInviteEmail &&
    inviteStatus !== "invited" &&
    inviteStatus !== "linked" &&
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
          title={
            !hasInviteEmail
              ? "Add an email before sending an invite."
              : onboarding?.has_session
                ? "An onboarding session already exists."
                : inviteStatus === "linked"
                  ? "This candidate is already linked."
                  : undefined
          }
          style={
            !canInvite && !inviting
              ? { opacity: 0.6, cursor: "not-allowed" }
              : undefined
          }
        >
          {inviting
            ? "Sending..."
            : !hasInviteEmail
              ? "Need Email"
              : inviteStatus === "linked"
                ? "Linked"
                : inviteStatus === "invited"
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

          <div className="hero-stat">
            <span className="hero-stat__label">Invite email</span>
            <strong style={{ wordBreak: "break-word", lineHeight: 1.35 }}>
              {candidate.email ?? "—"}
            </strong>
          </div>
        </div>
      ) : null}
    </article>
  );
}
