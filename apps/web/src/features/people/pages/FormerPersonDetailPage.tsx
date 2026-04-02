"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import SiteHeader from "@/features/landing/components/SiteHeader";

import PersonIdentityCard from "@/features/people/components/person-detail/PersonIdentityCard";
import PersonStatusCard from "@/features/people/components/person-detail/PersonStatusCard";
import PersonIdentifiersCard from "@/features/people/components/person-detail/PersonIdentifiersCard";
import PersonTimelinePanel from "@/features/people/components/person-detail/PersonTimelinePanel";
import PersonContactEditor from "@/features/people/components/person-detail/PersonContactEditor";
import FormerArchivePanel from "@/features/people/components/person-detail/FormerArchivePanel";

import { useFormerPersonDetailData } from "@/features/people/hooks/useFormerPersonDetailData";
import { useFormerPersonDetailActions } from "@/features/people/hooks/useFormerPersonDetailActions";

export default function FormerPersonDetailPage() {
  const params = useParams();
  const slug = String(params?.slug ?? "");
  const rosterId = String(params?.rosterId ?? "");

  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    person,
    events,
    loadingPerson,
    loadingEvents,
    error,
    setPerson,
  } = useFormerPersonDetailData(slug, rosterId);

  const { restoreToActive } = useFormerPersonDetailActions({
    setError: setActionError,
    setPerson,
  });

  const displayError = actionError ?? error;

  return (
    <main className="landing-page">
      <SiteHeader />

      <section className="value-strip">
        <div className="value-grid">
          <article className="value-card" style={{ gridColumn: "1 / -1" }}>
            <p className="value-card__eyebrow">People</p>
            <h2 className="value-card__title">Former person detail</h2>
            <p className="value-card__body">
              Archived workforce record. Preserves lifecycle history and operational context.
            </p>

            <div className="cta-row" style={{ marginTop: 14 }}>
              <Link className="button" href={`/company/${slug}/people/roster`}>
                Back to roster
              </Link>

              <Link className="button" href={`/company/${slug}/people`}>
                Back to people
              </Link>
            </div>
          </article>

          {displayError ? (
            <article className="value-card" style={{ gridColumn: "1 / -1" }}>
              <p style={{ color: "#c62828", margin: 0 }}>{displayError}</p>
            </article>
          ) : null}

          <PersonIdentityCard
            person={person}
            loading={loadingPerson}
            rosterId={rosterId}
            eyebrow="Former"
            title="Former person identity"
          />

          <PersonStatusCard
            person={person}
            loading={loadingPerson}
            stageLabel="Former"
            eyebrow="Status"
            title="Archived workforce posture"
          />

          <PersonIdentifiersCard
            person={person}
            loading={loadingPerson}
            eyebrow="Identifiers"
            title="Operational bridge fields"
          />

          <PersonContactEditor
            slug={slug}
            person={person}
            loading={loadingPerson}
            onSaved={setPerson}
          />

          <FormerArchivePanel
            person={person}
            loading={loadingPerson}
          />

          <PersonTimelinePanel
            events={events}
            loading={loadingEvents}
          />

          <article className="value-card">
            <p className="value-card__eyebrow">Actions</p>
            <h3 className="value-card__title">Archive management</h3>

            <div className="cta-row">
              <button
                className="button"
                type="button"
                disabled={submitting}
                onClick={() => restoreToActive(setSubmitting)}
              >
                {submitting ? "Updating..." : "Restore to Active"}
              </button>
            </div>

            {!loadingPerson && person ? (
              <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                <div className="hero-stat">
                  <span className="hero-stat__label">Last supervisor</span>
                  <strong>{person.reports_to_name}</strong>
                </div>

                <div className="hero-stat">
                  <span className="hero-stat__label">Hire date</span>
                  <strong>{person.hire_date}</strong>
                </div>
              </div>
            ) : null}
          </article>
        </div>
      </section>
    </main>
  );
}
