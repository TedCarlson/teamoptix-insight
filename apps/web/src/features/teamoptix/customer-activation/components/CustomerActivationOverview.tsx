import GoLiveControl from "@/features/teamoptix/customer-activation/components/GoLiveControl";
import ReadinessStatusControl from "@/features/teamoptix/customer-activation/components/ReadinessStatusControl";
import type {
  ActivationLifecycleStatus,
  CompanyActivationReadinessRecord,
  CompanyActivationSnapshot,
} from "@/features/teamoptix/customer-activation/server/customerActivation.server";

type Props = { slug: string; snapshot: CompanyActivationSnapshot };

const READINESS_LABELS: Record<CompanyActivationReadinessRecord["readiness_key"], string> = {
  commercial_ready: "Commercial",
  implementation_payment_ready: "Implementation payment",
  contract_ready: "Operating agreement",
  legal_signatures_ready: "Legal document signatures",
  workspace_ready: "Workspace",
  credentials_ready: "Credentials",
  automation_ready: "Automation",
  training_ready: "Training",
  customer_approval_ready: "Customer Go Live authorization",
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
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not recorded";
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
    timeZone: "America/New_York", timeZoneName: "short",
  }).format(date);
}

function statusLabel(value: string) {
  return value.replaceAll("_", " ").replace(/^\w/, (first) => first.toUpperCase());
}

function stepDisplayName(value: string) {
  return value.replaceAll("_", " ").replace(/^\w/, (first) => first.toUpperCase());
}

function signalClass(status: string) {
  if (status === "ready" || status === "complete") return "signal-pill signal-pill--healthy";
  if (status === "incomplete" || status === "failed") return "signal-pill signal-pill--failed";
  if (status === "partial" || status === "running") return "signal-pill signal-pill--degraded";
  return "signal-pill signal-pill--unknown";
}

export default function CustomerActivationOverview({ slug, snapshot }: Props) {
  const readyCount = snapshot.readiness.length - snapshot.blocking_readiness.length;
  const subscription = statusLabel(snapshot.activation.subscription_activation_status);

  return (
    <div className="customer-activation-overview">
      <section className="operating-pulse customer-activation-pulse" aria-label="Customer activation pulse">
        <article><span>Lifecycle</span><strong>{LIFECYCLE_LABELS[snapshot.activation.lifecycle_status]}</strong><small>Authoritative customer state</small></article>
        <article><span>Go Live</span><strong>{snapshot.is_ready_for_go_live ? "Ready" : `${snapshot.blocking_readiness.length} blocked`}</strong><small>{readyCount} of {snapshot.readiness.length} gates ready</small></article>
        <article><span>Billing</span><strong>{snapshot.activation.first_billing_date ?? "Not scheduled"}</strong><small>Calculated only after valid Go Live</small></article>
        <article><span>Subscription</span><strong>{subscription}</strong><small>Provider execution state</small></article>
      </section>

      <section className="command-panel activation-decision-panel">
        <div className="command-panel__header">
          <div><p className="value-card__eyebrow">Activation Decision</p><h2>Go Live checklist</h2></div>
          <GoLiveControl
            slug={slug}
            disabled={!snapshot.is_ready_for_go_live}
            blockingCount={snapshot.blocking_readiness.length}
            lifecycleStatus={snapshot.activation.lifecycle_status}
          />
        </div>

        {snapshot.blocking_readiness.length ? (
          <div className="activation-blocker-list">
            {snapshot.blocking_readiness.map((item) => (
              <div className="activation-blocker" key={item.readiness_key}>
                <span><strong>{READINESS_LABELS[item.readiness_key]}</strong><small>{item.blocking_reason ?? "Readiness evidence is incomplete."}</small></span>
                <em className="signal-pill signal-pill--failed">Blocking</em>
              </div>
            ))}
          </div>
        ) : (
          <div className="activation-clear"><strong>All Go Live gates are satisfied</strong><span>The activation run can begin when Team Optix approves execution.</span></div>
        )}

        <details className="governance-disclosure">
          <summary>Show all readiness gates <span>{readyCount} / {snapshot.readiness.length} ready</span></summary>
          <div className="activation-readiness-list">
            {snapshot.readiness.map((item) => (
              <div className="activation-readiness-row" key={item.readiness_key}>
                <strong>{READINESS_LABELS[item.readiness_key]}</strong>
                <ReadinessStatusControl
                  slug={slug}
                  readinessKey={item.readiness_key}
                  status={item.status}
                  editable={item.source_type !== "computed"}
                />
                <small>{item.status === "incomplete" ? item.blocking_reason ?? "Incomplete" : item.source_basis ?? `Completed ${formatDate(item.completed_at)}`}</small>
              </div>
            ))}
          </div>
        </details>
      </section>

      {snapshot.latest_run ? (
        <section className="command-panel activation-run-panel">
          <div className="command-panel__header">
            <div><p className="value-card__eyebrow">Activation History</p><h2>Latest execution</h2></div>
            <em className={signalClass(snapshot.latest_run.status)}>{statusLabel(snapshot.latest_run.status)}</em>
          </div>
          <div className="activation-run-summary">
            <span><small>Requested</small><strong>{formatDate(snapshot.latest_run.requested_at)}</strong></span>
            <span><small>Completed</small><strong>{formatDate(snapshot.latest_run.completed_at)}</strong></span>
            <span><small>Steps</small><strong>{snapshot.latest_run_steps.length}</strong></span>
          </div>
          {snapshot.latest_run.failure_summary ? <p className="activation-run-warning">{snapshot.latest_run.failure_summary}</p> : null}

          <details className="governance-disclosure activation-run-disclosure">
            <summary>Show technical execution evidence <span>Developer detail</span></summary>
            <div className="activation-step-list">
              {snapshot.latest_run_steps.map((step) => {
                const metadata = Object.keys(step.result_metadata ?? {}).length
                  ? JSON.stringify(step.result_metadata, null, 2)
                  : null;
                return (
                  <details className="activation-step" key={step.step_key}>
                    <summary>
                      <b>{step.step_order}</b>
                      <strong>{stepDisplayName(step.step_key)}</strong>
                      <em className={signalClass(step.status)}>{statusLabel(step.status)}</em>
                      <span>{step.attempt_count} attempt{step.attempt_count === 1 ? "" : "s"}</span>
                    </summary>
                    <div className="activation-step-detail">
                      <small>Started {formatDate(step.started_at)} · Completed {formatDate(step.completed_at)}</small>
                      {step.last_error ? <p className="activation-run-warning">{step.last_error}</p> : null}
                      {metadata ? <pre>{metadata}</pre> : null}
                    </div>
                  </details>
                );
              })}
            </div>
          </details>
        </section>
      ) : null}
    </div>
  );
}
