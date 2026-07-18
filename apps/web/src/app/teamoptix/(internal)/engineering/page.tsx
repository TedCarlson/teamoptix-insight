import TeamOptixDomainOverview from "@/features/teamoptix/shared/TeamOptixDomainOverview";
import { getPlatformHealth } from "@/features/teamoptix/engineering/platformTelemetry.server";

export const dynamic = "force-dynamic";

function stateDetail(state: string, observed: unknown) {
  if (state === "UNKNOWN") return "Not configured, not collected, or stale";
  if (!observed) return "No observation timestamp";
  return `Last observed ${new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }).format(new Date(String(observed)))}`;
}

export default async function Page() {
  const health = await getPlatformHealth();
  const states = health.services.map((service) => String(service.health_state));
  const overall = states.includes("FAILED") ? "Failed" : states.includes("DEGRADED") ? "Degraded" : states.every((state) => state === "HEALTHY") ? "Healthy" : "Unknown";
  const configured = health.services.filter((service) => service.health_state !== "UNKNOWN").length;
  const recentChecks = health.checks.slice(0, 6);

  return <TeamOptixDomainOverview eyebrow="TeamOptix · Engineering" title="Platform engineering" description="Provider health, release confidence, capacity, and the infrastructure dependencies supporting Insight."
    metrics={[
      { label: "Platform state", value: overall, detail: "Weakest critical dependency" },
      { label: "Observed services", value: `${configured} of ${health.services.length}`, detail: health.foundationReady ? "Telemetry foundation active" : "Migration pending" },
      { label: "Recent checks", value: health.checks.length, detail: "Immutable provider observations" },
      { label: "Stale threshold", value: "15 min", detail: "Stale observations become Unknown" },
    ]}
    panels={[
      { eyebrow: "Infrastructure", title: "Service health", actionLabel: "Code health", actionHref: "/teamoptix/engineering/health", rows: health.services.map((service) => ({
        title: String(service.service_name),
        detail: `${String(service.service_role)} · ${stateDetail(String(service.health_state), service.last_observed_at)}`,
        status: String(service.health_state),
        href: "/teamoptix/engineering/health",
      })) },
      { eyebrow: "Observation ledger", title: "Latest provider checks", actionLabel: "Releases", actionHref: "/teamoptix/engineering/releases", rows: recentChecks.length ? recentChecks.map((check) => ({
        title: `${String(check.service_key)} · ${String(check.check_name)}`,
        detail: check.error_message ? String(check.error_message) : `${String(check.latency_ms ?? "—")} ms · ${new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }).format(new Date(String(check.started_at)))}`,
        status: String(check.status),
        href: "/teamoptix/engineering/health",
      })) : [
        { title: "No provider checks collected", detail: "Apply the telemetry migration, configure read-only credentials, then run the collector", status: "Unknown", href: "/teamoptix/engineering/health" },
      ]},
      { eyebrow: "Delivery confidence", title: "Engineering gates", rows: [
        { title: "Type safety", detail: "Application-wide TypeScript verification before release", status: "Required", href: "/teamoptix/engineering/health" },
        { title: "Code quality", detail: "Lint and framework rules across the web application", status: "Required", href: "/teamoptix/engineering/health" },
        { title: "Production build", detail: "Next.js compilation and route generation", status: "Required", href: "/teamoptix/engineering/releases" },
      ]},
      { eyebrow: "Product impact", title: "Dependency authority", rows: [
        { title: "Infrastructure observation", detail: "Engineering reports service availability, performance, capacity, and protection", status: "Engineering", href: "/teamoptix/engineering/health" },
        { title: "Workflow outcomes", detail: "Automation reports collection, artifact, ingestion, and warehouse completion", status: "Automation", href: "/teamoptix/automation/telemetry" },
        { title: "Customer impact", detail: "Product governance interprets infrastructure and workflow evidence together", status: "Products", href: "/teamoptix/products/insight" },
      ]},
    ]}
  />;
}
