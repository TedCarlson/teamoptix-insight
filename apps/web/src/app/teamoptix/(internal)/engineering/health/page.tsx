import Link from "next/link";
import TeamOptixShell from "@/features/teamoptix/navigation/TeamOptixShell";
import { getPlatformHealth } from "@/features/teamoptix/engineering/platformTelemetry.server";

export const dynamic = "force-dynamic";

function time(value: unknown) {
  if (!value) return "Never observed";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }).format(new Date(String(value)));
}

export default async function Page() {
  const health = await getPlatformHealth();
  return (
    <TeamOptixShell>
      <main className="workspace-shell teamoptix-domain-overview">
        <section className="workspace-main">
          <header className="domain-heading"><p className="eyebrow">TeamOptix · Engineering</p><h1>Platform health</h1><p>Current provider evidence and the infrastructure dependencies supporting Insight.</p></header>

          <section className="engineering-service-grid">
            {health.services.map((service) => (
              <article className={`engineering-service-card engineering-service-card--${String(service.health_state).toLowerCase()}`} key={String(service.service_key)}>
                <div><p>{String(service.service_role)}</p><h2>{String(service.service_name)}</h2></div>
                <strong>{String(service.health_state)}</strong>
                <dl><div><dt>Last observed</dt><dd>{time(service.last_observed_at)}</dd></div><div><dt>Max latency</dt><dd>{service.max_latency_ms == null ? "—" : `${String(service.max_latency_ms)} ms`}</dd></div></dl>
              </article>
            ))}
          </section>

          {!health.foundationReady ? <section className="engineering-foundation-note"><strong>Telemetry migration pending</strong><span>Apply `20260718130000_platform_engineering_telemetry.sql` before collecting provider observations.</span></section> : null}

          <section className="command-center-grid">
            <article className="command-panel">
              <div className="command-panel__header"><div><p className="value-card__eyebrow">Evidence</p><h2>Provider check ledger</h2></div><span>{health.checks.length} recent</span></div>
              <div className="domain-row-list">
                {health.checks.length ? health.checks.map((check) => (
                  <div className="engineering-check-row" key={String(check.id)}>
                    <span><strong>{String(check.service_key)} · {String(check.check_name)}</strong><small>{check.error_message ? String(check.error_message) : `${String(check.latency_ms ?? "—")} ms · HTTP ${String(check.status_code ?? "—")}`}</small></span>
                    <em>{String(check.status)}</em><time>{time(check.started_at)}</time>
                  </div>
                )) : <div className="command-empty"><strong>No checks collected yet</strong><span>The five-minute collector will populate this ledger after configuration.</span></div>}
              </div>
            </article>

            <article className="command-panel">
              <div className="command-panel__header"><div><p className="value-card__eyebrow">Product impact</p><h2>Dependency authority</h2></div><Link href="/teamoptix/products/insight">Insight →</Link></div>
              <div className="dependency-stack">
                <div><strong>Vercel</strong><span>Application delivery, server routes, releases</span></div>
                <div><strong>Supabase</strong><span>Database, authentication, warehouse, storage state</span></div>
                <div><strong>DigitalOcean</strong><span>Runner host, source collection, transport execution</span></div>
                <div><strong>Backblaze B2</strong><span>Inspection evidence archive and retrieval</span></div>
              </div>
              <p className="engineering-authority-note">Engineering grades provider capability. Automation grades workflow outcomes. Product governance determines customer impact.</p>
            </article>
          </section>
        </section>
      </main>
    </TeamOptixShell>
  );
}
