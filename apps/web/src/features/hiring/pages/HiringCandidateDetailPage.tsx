"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import CandidateTimelinePanel from "@/features/hiring/components/candidate-detail/CandidateTimelinePanel";
import CandidateDetailsPanel from "@/features/hiring/components/candidate-detail/CandidateDetailsPanel";
import CandidateStatusProgressPanel from "@/features/hiring/components/candidate-detail/CandidateStatusProgressPanel";
import { useCandidateDetailData } from "@/features/hiring/hooks/useCandidateDetailData";
import { useCandidateDetailActions } from "@/features/hiring/hooks/useCandidateDetailActions";

export default function HiringCandidateDetailPage() {
  const params = useParams();
  const slug = String(params?.slug ?? "");
  const rosterId = String(params?.rosterId ?? "");

  const [actionError, setActionError] = useState<string | null>(null);
  const [activating, setActivating] = useState(false);
  const [inviting, setInviting] = useState(false);

  const {
    candidate,
    events,
    onboarding,
    loadingCandidate,
    loadingEvents,
    loadingOnboarding,
    error,
    setCandidate,
    setEvents,
  } = useCandidateDetailData(slug, rosterId);

  const { activateCandidate, sendInvite } = useCandidateDetailActions({
    slug,
    rosterId,
    setError: setActionError,
    setCandidate,
    setEvents,
  });

  const displayError = actionError ?? error;

  return (
    <main className="workspace-shell">

      <section className="value-strip">
        <div className="value-grid">
          <article className="value-card" style={{ gridColumn: "1 / -1" }}>
            <p className="value-card__eyebrow">Hiring</p>
            <h2 className="value-card__title">Candidate detail</h2>
            <p className="value-card__body">
              Candidate workspace anchored to a live roster record, lifecycle
              events, and onboarding progress.
            </p>

            <div className="cta-row" style={{ marginTop: 14 }}>
              <Link className="button" href={`/company/${slug}/hiring`}>
                Back to hiring
              </Link>
              <Link className="button" href={`/company/${slug}/people/roster`}>
                Back to roster
              </Link>
              <Link
                className="button"
                href="/onboarding/invite/test-token"
                target="_blank"
              >
                Open onboarding shell
              </Link>
            </div>
          </article>

          {displayError ? (
            <article className="value-card" style={{ gridColumn: "1 / -1" }}>
              <p style={{ color: "#c62828", margin: 0 }}>{displayError}</p>
            </article>
          ) : null}

          <CandidateDetailsPanel
            slug={slug}
            rosterId={rosterId}
            candidate={candidate}
            loading={loadingCandidate}
            onSaved={setCandidate}
          />

          <CandidateStatusProgressPanel
            candidate={candidate}
            onboarding={onboarding}
            loadingCandidate={loadingCandidate}
            loadingOnboarding={loadingOnboarding}
            inviting={inviting}
            activating={activating}
            onSendInvite={() => sendInvite(setInviting)}
            onActivate={() => activateCandidate(setActivating)}
          />

          <CandidateTimelinePanel
            events={events}
            loading={loadingEvents}
          />
        </div>
      </section>
    </main>
  );
}
