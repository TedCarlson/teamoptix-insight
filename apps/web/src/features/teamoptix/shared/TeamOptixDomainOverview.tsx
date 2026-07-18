import Link from "next/link";
import TeamOptixShell from "@/features/teamoptix/navigation/TeamOptixShell";

export type DomainMetric = { label: string; value: string | number; detail: string };
export type DomainRow = { id?: string; title: string; detail: string; status?: string; href: string };
export type DomainPanel = { eyebrow: string; title: string; actionLabel?: string; actionHref?: string; rows: DomainRow[] };

export default function TeamOptixDomainOverview(props: {
  eyebrow: string;
  title: string;
  description: string;
  metrics: DomainMetric[];
  panels: DomainPanel[];
}) {
  return (
    <TeamOptixShell>
      <main className="workspace-shell teamoptix-domain-overview">
        <section className="workspace-main">
          <header className="domain-heading">
            <p className="eyebrow">{props.eyebrow}</p>
            <h1>{props.title}</h1>
            <p>{props.description}</p>
          </header>

          <section className="operating-pulse domain-pulse" aria-label={`${props.title} operating pulse`}>
            {props.metrics.map((metric) => (
              <article key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.detail}</small></article>
            ))}
          </section>

          <section className="domain-panel-grid">
            {props.panels.map((panel) => (
              <article className="command-panel domain-panel" key={`${panel.eyebrow}:${panel.title}`}>
                <div className="command-panel__header">
                  <div><p className="value-card__eyebrow">{panel.eyebrow}</p><h2>{panel.title}</h2></div>
                  {panel.actionHref && panel.actionLabel ? <Link href={panel.actionHref}>{panel.actionLabel} →</Link> : null}
                </div>
                <div className="domain-row-list">
                  {panel.rows.map((row, index) => (
                    <Link className="domain-row" href={row.href} key={row.id ?? `${row.href}:${row.title}:${index}`}>
                      <span><strong>{row.title}</strong><small>{row.detail}</small></span>
                      {row.status ? <em>{row.status}</em> : null}
                      <b aria-hidden="true">→</b>
                    </Link>
                  ))}
                </div>
              </article>
            ))}
          </section>
        </section>
      </main>
    </TeamOptixShell>
  );
}
