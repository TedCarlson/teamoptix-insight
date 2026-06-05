import type {
  CandidateRecord,
  OnboardingPayload,
} from "@/features/hiring/lib/candidate-detail.types";

type CandidateStatusProgressPanelProps = {
  candidate: CandidateRecord | null;
  onboarding: OnboardingPayload | null;
  loadingCandidate: boolean;
  loadingOnboarding: boolean;
  inviting: boolean;
  activating: boolean;
  onSendInvite: () => void;
  onActivate: () => void;
};

function formatOptionalDate(value: string | null | undefined) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function getStageLabel(candidate: CandidateRecord | null, onboarding: OnboardingPayload | null) {
  if (candidate?.employment_status === "Active") return "Active";
  if (candidate?.employment_status === "Former") return "Former";
  if (candidate?.onboarding_completed_at || onboarding?.session_status === "completed") {
    return "Ready for Activation";
  }
  if (onboarding?.has_session) return "Onboarding";
  if (candidate?.invite_status === "Invited") return "Invited";
  return "Candidate Created";
}

function StatusRow(props: {
  label: string;
  value: string | number | null | undefined;
}) {
  const { label, value } = props;

  return (
    <div className="hero-stat">
      <span className="hero-stat__label">{label}</span>
      <strong>{value ?? "—"}</strong>
    </div>
  );
}

export default function CandidateStatusProgressPanel(
  props: CandidateStatusProgressPanelProps
) {
  const {
    candidate,
    onboarding,
    loadingCandidate,
    loadingOnboarding,
    inviting,
    activating,
    onSendInvite,
    onActivate,
  } = props;

  const stageLabel = getStageLabel(candidate, onboarding);
  const progressPercent = onboarding?.progress_pct ?? 0;
  const canActivate =
    candidate?.employment_status === "Candidate" &&
    (candidate?.onboarding_completed_at || onboarding?.session_status === "completed");

  return (
    <article className="value-card" style={{ gridColumn: "span 1" }}>
      <p className="value-card__eyebrow">Status</p>
      <h3 className="value-card__title">Progress & eligibility</h3>
      <p className="value-card__body" style={{ marginTop: 8 }}>
        Review current hiring posture and take the next relevant action from the same panel.
      </p>

      {loadingCandidate ? (
        <p className="value-card__body" style={{ marginTop: 14 }}>
          Loading status...
        </p>
      ) : (
        <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
          <StatusRow label="Current stage" value={stageLabel} />
          <StatusRow label="Employment status" value={candidate?.employment_status} />
          <StatusRow label="Invite status" value={candidate?.invite_status} />
          <StatusRow label="Compliance" value={candidate?.compliance_summary} />
          <StatusRow
            label="Onboarding"
            value={
              loadingOnboarding
                ? "Loading..."
                : onboarding?.has_session
                  ? onboarding.session_status ?? "Active"
                  : "Not started"
            }
          />
          <StatusRow
            label="Current step"
            value={loadingOnboarding ? "Loading..." : onboarding?.current_step ?? "—"}
          />
          <StatusRow
            label="Completed"
            value={formatOptionalDate(candidate?.onboarding_completed_at)}
          />

          <div style={{ marginTop: 8 }}>
            <div
              style={{
                width: "100%",
                height: 12,
                borderRadius: 999,
                background: "#eef2f7",
                overflow: "hidden",
                border: "1px solid #d6dfeb",
              }}
            >
              <div
                style={{
                  width: `${progressPercent}%`,
                  height: "100%",
                  background: "#4a78ff",
                  borderRadius: 999,
                }}
              />
            </div>

            <p style={{ margin: "8px 0 0", fontSize: 13, fontWeight: 800 }}>
              {progressPercent}% complete
            </p>
          </div>

          <div className="cta-row" style={{ marginTop: 8 }}>
            <button
              className="button button-primary"
              type="button"
              disabled={inviting || candidate?.invite_status === "Linked"}
              onClick={onSendInvite}
            >
              {inviting ? "Sending..." : candidate?.invite_status === "Invited" ? "Resend invite" : "Send invite"}
            </button>

            <button
              className="button"
              type="button"
              disabled={activating || !canActivate}
              onClick={onActivate}
              title={!canActivate ? "Candidate must complete onboarding before activation." : undefined}
            >
              {activating ? "Activating..." : "Activate"}
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
