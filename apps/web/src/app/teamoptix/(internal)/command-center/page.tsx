import Link from "next/link";
import TeamOptixShell from "@/features/teamoptix/navigation/TeamOptixShell";
import { getCommandCenterSnapshot } from "@/features/teamoptix/command-center/commandCenter.server";

export const dynamic = "force-dynamic";

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function shortDay(value: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}

export default async function TeamOptixCommandCenterPage() {
  const snapshot = await getCommandCenterSnapshot();
  const maxRuns = Math.max(1, ...snapshot.automation.daily.map((day) => day.successful + day.failed));
  const blockingCompanies = snapshot.companies.filter((company) => company.blocker_count > 0).length;

  return (
    <TeamOptixShell>
      <main className="workspace-shell teamoptix-command-center">
        <section className="workspace-main">
          <header className="command-center-heading">
            <div>
              <p className="eyebrow">TeamOptix operating center</p>
              <h1>Good morning.</h1>
              <p>Customer governance, implementation readiness, and platform operations at a glance.</p>
            </div>
            <time dateTime={new Date().toISOString()}>{new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" }).format(new Date())}</time>
          </header>

          <section className="operating-pulse" aria-label="Operating pulse">
            <article><span>Governed customers</span><strong>{snapshot.companies.length}</strong><small>Insight scope</small></article>
            <article><span>Implementation blockers</span><strong>{blockingCompanies}</strong><small>{blockingCompanies ? "Requires attention" : "No companies blocked"}</small></article>
            <article><span>Team Optix legal action</span><strong>{snapshot.legal.teamoptix_action}</strong><small>{snapshot.legal.open} open legal tasks</small></article>
            <article><span>Automation reliability</span><strong>{snapshot.automation.reliability == null ? "—" : `${snapshot.automation.reliability}%`}</strong><small>Trailing 7 days</small></article>
            <article><span>Awaiting ingestion</span><strong>{snapshot.collections.awaiting_ingestion}</strong><small>{snapshot.collections.ingested_today} ingested today</small></article>
          </section>

          <section className="command-center-grid">
            <article className="command-panel command-panel--attention">
              <div className="command-panel__header">
                <div><p className="value-card__eyebrow">Action center</p><h2>Needs attention</h2></div>
                <span>{snapshot.attention.length} open</span>
              </div>
              <div className="attention-list">
                {snapshot.attention.length ? snapshot.attention.map((item) => (
                  <Link href={item.href} className="attention-row" key={item.key}>
                    <span className={`attention-row__priority attention-row__priority--${item.priority.toLowerCase()}`}>{item.priority}</span>
                    <span className="attention-row__copy"><strong>{item.message}</strong><small>{item.company_name} · {item.detail}</small></span>
                    <span aria-hidden="true">→</span>
                  </Link>
                )) : (
                  <div className="command-empty"><strong>No recorded exceptions</strong><span>Implementation, legal, and automation queues are clear.</span></div>
                )}
              </div>
            </article>

            <article className="command-panel">
              <div className="command-panel__header">
                <div><p className="value-card__eyebrow">Platform operations</p><h2>Automation health</h2></div>
                <Link href="/teamoptix/automation/telemetry">Telemetry →</Link>
              </div>
              <div className="automation-summary">
                <div><strong>{snapshot.automation.successful_7d}</strong><span>successful</span></div>
                <div><strong>{snapshot.automation.failed_7d}</strong><span>failed</span></div>
                <div><strong>{snapshot.collections.completed_today}</strong><span>collections today</span></div>
              </div>
              <div className="run-chart" role="img" aria-label="Successful and failed automation runs over seven days">
                {snapshot.automation.daily.map((day) => (
                  <div className="run-chart__day" key={day.date}>
                    <div className="run-chart__bars">
                      <span className="run-chart__success" style={{ height: `${Math.max(day.successful ? 8 : 0, (day.successful / maxRuns) * 100)}%` }} title={`${day.successful} successful`} />
                      <span className="run-chart__failure" style={{ height: `${Math.max(day.failed ? 8 : 0, (day.failed / maxRuns) * 100)}%` }} title={`${day.failed} failed`} />
                    </div>
                    <small>{shortDay(day.date)}</small>
                  </div>
                ))}
              </div>
              <div className="run-chart__legend"><span><i className="legend-success" /> Successful</span><span><i className="legend-failure" /> Failed</span></div>
            </article>
          </section>

          <section className="command-panel customer-portfolio">
            <div className="command-panel__header">
              <div><p className="value-card__eyebrow">Customer governance</p><h2>Implementation portfolio</h2></div>
              <Link href="/teamoptix/customers">Manage customers →</Link>
            </div>
            <div className="portfolio-table" role="table" aria-label="Insight customer implementation portfolio">
              <div className="portfolio-table__head" role="row"><span>Company</span><span>Lifecycle</span><span>Readiness</span><span>Blockers</span><span /></div>
              {snapshot.companies.map((company) => {
                const percent = company.readiness_total ? Math.round(company.readiness_complete / company.readiness_total * 100) : 0;
                return (
                  <div className="portfolio-table__row" role="row" key={company.id}>
                    <span><strong>{company.company_name ?? company.company_slug}</strong><small>{label(company.company_status)}</small></span>
                    <span><em>{label(company.lifecycle_status)}</em></span>
                    <span className="readiness-meter"><i><b style={{ width: `${percent}%` }} /></i><small>{company.readiness_total ? `${company.readiness_complete} of ${company.readiness_total}` : "Not initialized"}</small></span>
                    <span className={company.blocker_count ? "portfolio-blocker" : "portfolio-clear"}>{company.blocker_count ? company.blocker_count : "Clear"}</span>
                    <Link href={`/teamoptix/customers/${company.company_slug}`}>Review →</Link>
                  </div>
                );
              })}
              {!snapshot.companies.length ? <div className="command-empty"><strong>No governed Insight customers</strong><span>Customers appear after activation or automation governance is established.</span></div> : null}
            </div>
          </section>

          <section className="governance-grid">
            <article className="command-panel governance-card">
              <p className="value-card__eyebrow">Business governance</p><h2>Legal execution</h2>
              <div className="governance-stat"><strong>{snapshot.legal.customer_action}</strong><span>Awaiting customer action</span></div>
              <div className="governance-stat"><strong>{snapshot.legal.teamoptix_action}</strong><span>Awaiting Team Optix</span></div>
              <Link href="/teamoptix/business/contracts/tasks">Open legal queue →</Link>
            </article>
            <article className="command-panel governance-card">
              <p className="value-card__eyebrow">Implementation</p><h2>Process controls</h2>
              <div className="governance-link"><strong>Contract authoring</strong><span>Continue document governance and execution.</span><Link href="/teamoptix/business/contracts">Open contracts →</Link></div>
              <div className="governance-link"><strong>Implementation walkthrough</strong><span>Review readiness from commercial setup through Go Live.</span><Link href="/teamoptix/customers">Open implementations →</Link></div>
            </article>
          </section>
        </section>
      </main>
    </TeamOptixShell>
  );
}
