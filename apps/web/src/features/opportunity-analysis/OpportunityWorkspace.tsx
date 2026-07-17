import Link from "next/link";
import type { ReactNode } from "react";

type WorkspaceLink = {
  eyebrow: string;
  title: string;
  body: string;
  href: string;
};

export function OpportunityWorkspaceHeader(props: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="workspace-header">
      <div className="workspace-header__copy">
        <p className="eyebrow">{props.eyebrow}</p>
        <h1>{props.title}</h1>
        <p>{props.description}</p>
      </div>
      {props.action ? <div className="workspace-header__action">{props.action}</div> : null}
    </header>
  );
}

export function OpportunityWorkspaceGrid({ links }: { links: WorkspaceLink[] }) {
  return (
    <section className="workspace-grid">
      {links.map((item) => (
        <Link key={item.href} href={item.href} style={{ color: "inherit", textDecoration: "none" }}>
          <article className="app-card" style={{ display: "grid", gap: 10, height: "100%" }}>
            <p className="value-card__eyebrow">{item.eyebrow}</p>
            <h2 className="app-card__title">{item.title}</h2>
            <p className="app-card__body">{item.body}</p>
            <strong style={{ marginTop: "auto" }}>Open workspace →</strong>
          </article>
        </Link>
      ))}
    </section>
  );
}

export function OpportunityFoundationNotice({ children }: { children: ReactNode }) {
  return (
    <article className="app-card" style={{ padding: 16 }}>
      <p className="value-card__eyebrow">Foundation status</p>
      <p className="app-card__body" style={{ marginTop: 8 }}>{children}</p>
    </article>
  );
}
