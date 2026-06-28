type OnboardingStep = {
  step_key: string;
  label: string;
  step_order: number;
  completed: boolean;
  completed_at: string | null;
};

type OnboardingPayload = {
  has_session: boolean;
  session_id: string | null;
  session_status: string | null;
  onboarding_completed_at: string | null;
  progress_pct: number;
  current_step: string | null;
  steps: OnboardingStep[];
};

function MilestoneRow(props: {
  label: string;
  state: "complete" | "current" | "pending";
  detail: string;
}) {
  const { label, state, detail } = props;

  const badgeText =
    state === "complete"
      ? "Complete"
      : state === "current"
        ? "Current"
        : "Pending";

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "110px 1fr",
        gap: 12,
        alignItems: "start",
        padding: "10px 0",
        borderBottom: "1px solid #e6edf5",
      }}
    >
      <span
        style={{
          display: "inline-flex",
          width: "fit-content",
          alignItems: "center",
          justifyContent: "center",
          minWidth: 82,
          padding: "6px 10px",
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.03em",
          textTransform: "uppercase",
          border: "1px solid #d6dfeb",
          background:
            state === "complete"
              ? "#e9f7ef"
              : state === "current"
                ? "#eef4ff"
                : "#f6f8fb",
          color:
            state === "complete"
              ? "#1f7a4d"
              : state === "current"
                ? "#2f61d5"
                : "#5c6b84",
        }}
      >
        {badgeText}
      </span>

      <div>
        <div style={{ fontWeight: 700, color: "#17213a" }}>{label}</div>
        <div style={{ marginTop: 4, color: "#5c6b84", fontSize: 14 }}>
          {detail}
        </div>
      </div>
    </div>
  );
}

function formatOptionalDate(value: string | null) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export default function CandidateProgressPanel(props: {
  onboarding: OnboardingPayload | null;
  loading: boolean;
}) {
  const { onboarding, loading } = props;
  const progressPercent = onboarding?.progress_pct ?? 0;

  return (
    <article className="value-card" style={{ gridColumn: "1 / span 2" }}>
      <p className="value-card__eyebrow">Progress</p>
      <h3 className="value-card__title">Candidate progress</h3>
      <p className="value-card__body" style={{ marginTop: 8 }}>
        This View surface now shows the real onboarding progress and pending work.
      </p>

      <div style={{ marginTop: 18 }}>
        <div
          style={{
            width: "100%",
            height: 14,
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

        <div
          style={{
            marginTop: 8,
            fontSize: 14,
            fontWeight: 700,
            color: "#17213a",
          }}
        >
          {progressPercent}% complete
        </div>
      </div>

      <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
        <div className="hero-stat">
          <span className="hero-stat__label">Onboarding session</span>
          <strong>
            {loading
              ? "Loading..."
              : onboarding?.has_session
                ? onboarding.session_status ?? "active"
                : "Not started"}
          </strong>
        </div>

        <div className="hero-stat">
          <span className="hero-stat__label">Current step</span>
          <strong>
            {loading ? "Loading..." : onboarding?.current_step ?? "—"}
          </strong>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        {loading ? (
          <div>Loading onboarding progress...</div>
        ) : onboarding?.steps?.length ? (
          onboarding.steps.map((step) => (
            <MilestoneRow
              key={step.step_key}
              label={step.label}
              state={step.completed ? "complete" : "pending"}
              detail={
                step.completed
                  ? `Completed ${formatOptionalDate(step.completed_at)}`
                  : "Pending completion"
              }
            />
          ))
        ) : (
          <div>No onboarding session started.</div>
        )}
      </div>
    </article>
  );
}