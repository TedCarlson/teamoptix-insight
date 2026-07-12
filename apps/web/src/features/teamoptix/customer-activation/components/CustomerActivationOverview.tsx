import GoLiveControl from "@/features/teamoptix/customer-activation/components/GoLiveControl";
import ReadinessStatusControl from "@/features/teamoptix/customer-activation/components/ReadinessStatusControl";
import type {
  ActivationLifecycleStatus,
  CompanyActivationReadinessRecord,
  CompanyActivationSnapshot,
} from "@/features/teamoptix/customer-activation/server/customerActivation.server";

type CustomerActivationOverviewProps = {
  slug: string;
  snapshot: CompanyActivationSnapshot;
};

const READINESS_LABELS: Record<
  CompanyActivationReadinessRecord["readiness_key"],
  string
> = {
  commercial_ready: "Commercial",
  implementation_payment_ready: "Implementation payment",
  contract_ready: "Agreement",
  workspace_ready: "Workspace",
  credentials_ready: "Credentials",
  automation_ready: "Automation",
  training_ready: "Training",
  customer_approval_ready: "Customer approval",
};

const LIFECYCLE_LABELS: Record<ActivationLifecycleStatus, string> = {
  implementation: "Implementation",
  ready_for_go_live: "Ready for Go Live",
  activation_in_progress: "Activation in progress",
  active: "Active",
  activation_failed: "Activation needs attention",
  paused: "Paused",
  cancelled: "Cancelled",
  archived: "Archived",
};

function formatDate(value: string | null) {
  if (!value) {
    return "Not recorded";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not recorded";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
    timeZoneName: "short",
  }).format(date);
}

function readinessState(
  item: CompanyActivationReadinessRecord
): {
  symbol: string;
  label: string;
} {
  if (item.status === "ready") {
    return {
      symbol: "✓",
      label: "Ready",
    };
  }

  if (item.status === "not_applicable") {
    return {
      symbol: "—",
      label: "Not applicable",
    };
  }

  return {
    symbol: "○",
    label: "Incomplete",
  };
}

function statusLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/^\w/, (first) => first.toUpperCase());
}

function formatMetadata(value: Record<string, unknown>) {
  const entries = Object.entries(value ?? {});

  if (entries.length === 0) {
    return null;
  }

  return JSON.stringify(value, null, 2);
}

function stepDisplayName(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/^\w/, (first) => first.toUpperCase());
}

export default function CustomerActivationOverview({
  slug,
  snapshot,
}: CustomerActivationOverviewProps) {
  return (
    <div style={{ display: "grid", gap: 18 }}>
      <section className="summary-grid">
        <article className="app-card">
          <p className="value-card__eyebrow">
            Customer lifecycle
          </p>

          <h3 className="app-card__title">
            {LIFECYCLE_LABELS[
              snapshot.activation.lifecycle_status
            ]}
          </h3>

          <p className="app-card__body">
            Authoritative Team Optix customer state. Workspace
            availability and Stripe provider status remain separate.
          </p>
        </article>

        <article className="app-card">
          <p className="value-card__eyebrow">
            Go Live readiness
          </p>

          <h3 className="app-card__title">
            {snapshot.is_ready_for_go_live
              ? "Ready"
              : `${snapshot.blocking_readiness.length} blocking`}
          </h3>

          <p className="app-card__body">
            {snapshot.is_ready_for_go_live
              ? "All required readiness domains are complete."
              : "Incomplete readiness items must be resolved before activation can begin."}
          </p>
        </article>

        <article className="app-card">
          <p className="value-card__eyebrow">
            First billing date
          </p>

          <h3 className="app-card__title">
            {snapshot.activation.first_billing_date ??
              "Not calculated"}
          </h3>

          <p className="app-card__body">
            Calculated and persisted when Team Optix requests
            Go Live.
          </p>
        </article>

        <article className="app-card">
          <p className="value-card__eyebrow">
            Subscription activation
          </p>

          <h3 className="app-card__title">
            {snapshot.activation.subscription_activation_status
              .replaceAll("_", " ")
              .replace(/^\w/, (value) => value.toUpperCase())}
          </h3>

          <p className="app-card__body">
            Provider subscription execution remains independently
            auditable from the customer lifecycle.
          </p>
        </article>
      </section>

      <article className="app-card">
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 18,
            flexWrap: "wrap",
          }}
        >
          <div>
            <p className="value-card__eyebrow">
              Activation readiness
            </p>

            <h3 className="app-card__title">
              Go Live checklist
            </h3>

            <p className="app-card__body">
              Each readiness domain retains its own source,
              completion evidence, and blocking reason.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gap: 10,
              justifyItems: "end",
            }}
          >
            <div
              aria-label="Go Live readiness summary"
              style={{
                fontWeight: 700,
                whiteSpace: "nowrap",
              }}
            >
              {snapshot.readiness.length -
                snapshot.blocking_readiness.length}
              {" / "}
              {snapshot.readiness.length}
              {" ready"}
            </div>

            <GoLiveControl
              slug={slug}
              disabled={!snapshot.is_ready_for_go_live}
              blockingCount={
                snapshot.blocking_readiness.length
              }
              lifecycleStatus={
                snapshot.activation.lifecycle_status
              }
            />
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gap: 10,
            marginTop: 18,
          }}
        >
          {snapshot.readiness.map((item) => {
            const state = readinessState(item);

            return (
              <div
                key={item.readiness_key}
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "minmax(180px, 0.8fr) minmax(120px, 0.45fr) minmax(240px, 1.5fr)",
                  gap: 14,
                  alignItems: "center",
                  padding: "12px 0",
                  borderTop: "1px solid var(--border-subtle)",
                }}
              >
                <strong>
                  {READINESS_LABELS[item.readiness_key]}
                </strong>

                <ReadinessStatusControl
                  slug={slug}
                  readinessKey={item.readiness_key}
                  status={item.status}
                  editable={item.source_type !== "computed"}
                />

                <span className="app-card__body">
                  {item.status === "incomplete"
                    ? item.blocking_reason ??
                      "Readiness has not been completed."
                    : item.source_basis ??
                      `Completed ${formatDate(
                        item.completed_at
                      )}`}
                </span>
              </div>
            );
          })}
        </div>
      </article>

      {snapshot.latest_run ? (
        <article className="app-card">
          <p className="value-card__eyebrow">
            Latest activation run
          </p>

          <h3 className="app-card__title">
            {statusLabel(snapshot.latest_run.status)}
          </h3>

          <p className="app-card__body">
            Requested {formatDate(snapshot.latest_run.requested_at)}
            {" · "}
            {snapshot.latest_run_steps.length} recorded steps
          </p>

          <div
            style={{
              display: "grid",
              gap: 8,
              marginTop: 12,
              color: "#64748b",
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            <div>
              Started: {formatDate(snapshot.latest_run.started_at)}
            </div>
            <div>
              Completed: {formatDate(snapshot.latest_run.completed_at)}
            </div>

            {snapshot.latest_run.failure_summary ? (
              <div
                style={{
                  color: "#b91c1c",
                  fontWeight: 900,
                }}
              >
                Failure: {snapshot.latest_run.failure_summary}
              </div>
            ) : null}
          </div>

          <div
            style={{
              display: "grid",
              gap: 10,
              marginTop: 18,
            }}
          >
            {snapshot.latest_run_steps.map((step) => {
              const metadata = formatMetadata(step.result_metadata);

              return (
                <div
                  key={step.step_key}
                  style={{
                    display: "grid",
                    gap: 8,
                    padding: "12px 0",
                    borderTop: "1px solid var(--border-subtle)",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "48px minmax(220px, 1fr) minmax(120px, 0.35fr) minmax(110px, 0.25fr)",
                      gap: 12,
                      alignItems: "center",
                    }}
                  >
                    <strong>{step.step_order}</strong>
                    <strong>{stepDisplayName(step.step_key)}</strong>
                    <span
                      style={{
                        fontWeight: 900,
                        color:
                          step.status === "failed"
                            ? "#b91c1c"
                            : step.status === "complete"
                              ? "#059669"
                              : "#64748b",
                      }}
                    >
                      {statusLabel(step.status)}
                    </span>
                    <span className="app-card__body">
                      Attempts: {step.attempt_count}
                    </span>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gap: 6,
                      paddingLeft: 60,
                    }}
                  >
                    <span className="app-card__body">
                      Started {formatDate(step.started_at)}
                      {" · "}
                      Completed {formatDate(step.completed_at)}
                    </span>

                    {step.last_error ? (
                      <span
                        style={{
                          color: "#b91c1c",
                          fontWeight: 800,
                        }}
                      >
                        Error: {step.last_error}
                      </span>
                    ) : null}

                    {metadata ? (
                      <pre
                        style={{
                          margin: 0,
                          whiteSpace: "pre-wrap",
                          border: "1px solid var(--border-subtle)",
                          borderRadius: 12,
                          padding: 12,
                          background: "#f8fafc",
                          color: "#334155",
                          fontSize: 12,
                          lineHeight: 1.5,
                          overflowX: "auto",
                        }}
                      >
                        {metadata}
                      </pre>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </article>
      ) : null}
    </div>
  );
}
