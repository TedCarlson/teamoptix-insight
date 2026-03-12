"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import SiteHeader from "@/features/landing/components/SiteHeader";
import { useLob } from "@/features/lob/hooks/useLob";

function ModuleCard(props: {
  eyebrow: string;
  title: string;
  body: string;
  href: string;
  cta: string;
}) {
  const { eyebrow, title, body, href, cta } = props;

  return (
    <article className="value-card">
      <p className="value-card__eyebrow">{eyebrow}</p>
      <h3 className="value-card__title">{title}</h3>
      <p className="value-card__body">{body}</p>

      <div className="cta-row" style={{ marginTop: 14 }}>
        <Link className="button button-primary" href={href}>
          {cta}
        </Link>
      </div>
    </article>
  );
}

export default function CompanyPeoplePage() {
  const params = useParams();
  const slug = String(params?.slug ?? "");
  const lob = useLob();

  return (
    <main className="landing-page">
      <SiteHeader />

      <section className="value-strip">
        <div className="value-grid">
          <article className="value-card" style={{ gridColumn: "1 / -1" }}>
            <p className="value-card__eyebrow">People</p>
            <h2 className="value-card__title">People workspace</h2>
            <p className="value-card__body">
              Workforce management for the selected company. This module will own
              roster, employee profiles, hiring posture, compliance, imports, and
              invitation workflows.
            </p>

            <div className="cta-row" style={{ marginTop: 14 }}>
              <Link className="button" href={`/company/${slug}`}>
                Back to company
              </Link>
              <Link
                className="button button-primary"
                href={`/company/${slug}/people/roster`}
              >
                Open roster
              </Link>
            </div>
          </article>

          <article className="value-card">
            <p className="value-card__eyebrow">Shell context</p>

            <div className="hero-stat">
              <span className="hero-stat__label">LOB</span>
              <strong>{lob.lob_label}</strong>
            </div>

            <div className="hero-stat">
              <span className="hero-stat__label">Industry</span>
              <strong>{lob.industry_label}</strong>
            </div>

            <div className="hero-stat">
              <span className="hero-stat__label">Current surface</span>
              <strong>People</strong>
            </div>
          </article>

          <ModuleCard
            eyebrow="Roster"
            title="Operational workforce index"
            body="Active, candidate, and former workforce records for the company."
            href={`/company/${slug}/people/roster`}
            cta="Open roster"
          />

          <ModuleCard
            eyebrow="Compliance"
            title="Requirements and expirations"
            body="Driver license, DOT, qualification, and onboarding requirement posture."
            href="#"
            cta="Coming soon"
          />

          <ModuleCard
            eyebrow="Imports"
            title="Bulk migration and matching"
            body="Upload and review current or former employee records before commit."
            href="#"
            cta="Coming soon"
          />

          <ModuleCard
            eyebrow="Invitations"
            title="Link people into the app"
            body="Send, track, and complete invitation and account-link workflows."
            href="#"
            cta="Coming soon"
          />
        </div>
      </section>
    </main>
  );
}