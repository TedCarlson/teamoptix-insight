"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import PersonIdentityCard from "@/features/people/components/person-detail/PersonIdentityCard";
import PersonStatusCard from "@/features/people/components/person-detail/PersonStatusCard";
import PersonIdentifiersCard from "@/features/people/components/person-detail/PersonIdentifiersCard";
import PersonTimelinePanel from "@/features/people/components/person-detail/PersonTimelinePanel";
import PersonContactEditor from "@/features/people/components/person-detail/PersonContactEditor";
import ActiveOperationalPanel from "@/features/people/components/person-detail/ActiveOperationalPanel";
import ActiveOperationsEditor from "@/features/people/components/person-detail/ActiveOperationsEditor";
import { useActivePersonDetailData } from "@/features/people/hooks/useActivePersonDetailData";
import { useActivePersonDetailActions } from "@/features/people/hooks/useActivePersonDetailActions";

export default function ActivePersonDetailPage() {
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
  } = useActivePersonDetailData(slug, rosterId);

  const { markFormer } = useActivePersonDetailActions({
    setError: setActionError,
    setPerson,
  });

  async function saveOperations(draft: {
    dswid: string;
    dot_expiration_date: string;
    qual_cert_expiration_date: string;
    daily_pay: boolean;
    scanner_serial: string;
  }) {
    setActionError(null);

    const res = await fetch(
      `/api/company/${slug}/people/roster/${rosterId}/operations`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(draft),
        credentials: "include",
      }
    );

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data?.error ?? "Update failed");
    }

    setPerson((prev) =>
      prev
        ? {
            ...prev,
            ...draft,
          }
        : prev
    );
  }

  const displayError = actionError ?? error;

  return (
    <main className="workspace-shell">

      <section className="value-strip">
        <div className="value-grid">
          <article className="value-card" style={{ gridColumn: "1 / -1" }}>
            <p className="value-card__eyebrow">People</p>
            <h2 className="value-card__title">Active person detail</h2>
            <p className="value-card__body">
              Operational workforce record for an active person.
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
            eyebrow="Active"
            title="Active person identity"
          />

          <PersonStatusCard
            person={person}
            loading={loadingPerson}
            stageLabel="Active"
            eyebrow="Status"
            title="Active workforce posture"
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

          <ActiveOperationalPanel
            person={person}
            loading={loadingPerson}
          />

          <ActiveOperationsEditor
            person={person}
            loading={loadingPerson}
            onSave={saveOperations}
          />

          <PersonTimelinePanel
            events={events}
            loading={loadingEvents}
          />

          <article className="value-card">
            <p className="value-card__eyebrow">Actions</p>
            <h3 className="value-card__title">Next actions</h3>

            <div className="cta-row">
              <button className="button" type="button">
                Add note
              </button>
              <button className="button" type="button">
                Update identifiers
              </button>
              <button
                className="button"
                type="button"
                disabled={submitting}
                onClick={() => markFormer(setSubmitting)}
              >
                {submitting ? "Updating..." : "Mark Former"}
              </button>
            </div>

            {!loadingPerson && person ? (
              <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                <div className="hero-stat">
                  <span className="hero-stat__label">Reports to</span>
                  <strong>{person.reports_to_name}</strong>
                </div>

                <div className="hero-stat">
                  <span className="hero-stat__label">Start date</span>
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
