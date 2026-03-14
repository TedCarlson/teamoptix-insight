"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import SiteHeader from "@/features/landing/components/SiteHeader";

type ApiRosterRow = {
  roster_member_id: string;
  full_name: string | null;
  worker_type: string | null;
  employment_status: "Active" | "Candidate" | "Former" | null;
  market_code: string | null;
  reports_to_name: string | null;
  hire_date: string | null;
  invite_status: string | null;
  compliance_summary: string | null;
  onboarding_completed_at?: string | null;
};

type ApiEventRow = {
  id: string;
  company_id: string;
  roster_id: string;
  event_category: string;
  event_type: string;
  event_detail: string | null;
  event_metadata: Record<string, unknown> | null;
  occurred_at: string;
  created_at: string;
};

type CandidateRecord = {
  id: string;
  full_name: string;
  worker_type: string;
  employment_status: "Active" | "Candidate" | "Former";
  market_code: string;
  reports_to_name: string;
  hire_date: string;
  invite_status: string;
  compliance_summary: string;
  onboarding_completed_at: string | null;
};

type OnboardingStep = {
  step_key: string;
  label: string;
  step_order: number;
  completed: boolean;
  completed_at: string | null;
};

type OnboardingPayload = {
  has_session: boolean;
  session_id: string | null;
  session_status: string | null;
  onboarding_completed_at: string | null;
  progress_pct: number;
  current_step: string | null;
  steps: OnboardingStep[];
};

function DetailCard(props: {
  eyebrow: string;
  title: string;
  body?: string;
  children?: React.ReactNode;
}) {
  const { eyebrow, title, body, children } = props;

  return (
    <article className="value-card">
      <p className="value-card__eyebrow">{eyebrow}</p>
      <h3 className="value-card__title">{title}</h3>
      {body ? <p className="value-card__body">{body}</p> : null}
      {children ? <div style={{ marginTop: 14 }}>{children}</div> : null}
    </article>
  );
}

function MilestoneRow(props: {
  label: string;
  state: "complete" | "current" | "pending";
  detail: string;
}) {
  const { label, state, detail } = props;

  const badgeText =
    state === "complete"
      ? "Complete"
      : state === "current"
        ? "Current"
        : "Pending";

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "110px 1fr",
        gap: 12,
        alignItems: "start",
        padding: "10px 0",
        borderBottom: "1px solid #e6edf5",
      }}
    >
      <span
        style={{
          display: "inline-flex",
          width: "fit-content",
          alignItems: "center",
          justifyContent: "center",
          minWidth: 82,
          padding: "6px 10px",
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.03em",
          textTransform: "uppercase",
          border: "1px solid #d6dfeb",
          background:
            state === "complete"
              ? "#e9f7ef"
              : state === "current"
                ? "#eef4ff"
                : "#f6f8fb",
          color:
            state === "complete"
              ? "#1f7a4d"
              : state === "current"
                ? "#2f61d5"
                : "#5c6b84",
        }}
      >
        {badgeText}
      </span>

      <div>
        <div style={{ fontWeight: 700, color: "#17213a" }}>{label}</div>
        <div style={{ marginTop: 4, color: "#5c6b84", fontSize: 14 }}>
          {detail}
        </div>
      </div>
    </div>
  );
}

function TimelineRow(props: {
  label: string;
  detail: string;
  timestamp: string;
}) {
  const { label, detail, timestamp } = props;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "140px 1fr",
        gap: 12,
        alignItems: "start",
        padding: "10px 0",
        borderBottom: "1px solid #e6edf5",
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: "#5c6b84",
        }}
      >
        {timestamp}
      </div>

      <div>
        <div style={{ fontWeight: 700, color: "#17213a" }}>{label}</div>
        <div style={{ marginTop: 4, color: "#5c6b84", fontSize: 14 }}>
          {detail}
        </div>
      </div>
    </div>
  );
}

function formatEventLabel(eventType: string) {
  switch (eventType) {
    case "candidate_imported":
      return "Candidate imported";
    case "invite_sent":
      return "Invite sent";
    case "invite_reset":
      return "Invite reset";
    default:
      return eventType.replaceAll("_", " ");
  }
}

function formatTimestamp(value: string) {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function formatOptionalDate(value: string | null) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export default function HiringCandidateDetailPage() {
  const params = useParams();
  const slug = String(params?.slug ?? "");
  const rosterId = String(params?.rosterId ?? "");

  const [candidate, setCandidate] = useState<CandidateRecord | null>(null);
  const [events, setEvents] = useState<ApiEventRow[]>([]);
  const [onboarding, setOnboarding] = useState<OnboardingPayload | null>(null);
  const [loadingCandidate, setLoadingCandidate] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loadingOnboarding, setLoadingOnboarding] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activating, setActivating] = useState(false);
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadCandidate() {
      try {
        setLoadingCandidate(true);
        setError(null);

        const res = await fetch(`/api/company/${slug}/people/roster`, {
          credentials: "include",
        });

        const data = await res.json();

        if (!active) return;

        if (!res.ok) {
          setError(data?.error ?? "Failed to load candidate.");
          setCandidate(null);
          return;
        }

        const found = ((data?.roster ?? []) as ApiRosterRow[]).find(
          (row) => row.roster_member_id === rosterId
        );

        if (!found) {
          setError("Candidate record not found.");
          setCandidate(null);
          return;
        }

        setCandidate({
          id: found.roster_member_id,
          full_name: found.full_name ?? "Unknown",
          worker_type: found.worker_type ?? "Unassigned",
          employment_status: found.employment_status ?? "Candidate",
          market_code: found.market_code ?? "—",
          reports_to_name: found.reports_to_name ?? "—",
          hire_date: found.hire_date ?? "—",
          invite_status: found.invite_status ?? "Not Invited",
          compliance_summary: found.compliance_summary ?? "Missing",
          onboarding_completed_at: found.onboarding_completed_at ?? null,
        });
      } catch {
        if (!active) return;
        setError("Candidate request failed.");
        setCandidate(null);
      } finally {
        if (active) setLoadingCandidate(false);
      }
    }

    async function loadEvents() {
      try {
        setLoadingEvents(true);

        const res = await fetch(
          `/api/company/${slug}/people/roster/${rosterId}/events`,
          { credentials: "include" }
        );

        const data = await res.json();

        if (!active) return;

        if (!res.ok) {
          setEvents([]);
          return;
        }

        setEvents((data?.events ?? []) as ApiEventRow[]);
      } catch {
        if (!active) return;
        setEvents([]);
      } finally {
        if (active) setLoadingEvents(false);
      }
    }

    async function loadOnboarding() {
      try {
        setLoadingOnboarding(true);

        const res = await fetch(
          `/api/company/${slug}/people/roster/${rosterId}/onboarding`,
          { credentials: "include" }
        );

        const data = await res.json();

        if (!active) return;

        if (!res.ok) {
          setOnboarding(null);
          return;
        }

        setOnboarding((data?.onboarding ?? null) as OnboardingPayload | null);
      } catch {
        if (!active) return;
        setOnboarding(null);
      } finally {
        if (active) setLoadingOnboarding(false);
      }
    }

    if (slug && rosterId) {
      loadCandidate();
      loadEvents();
      loadOnboarding();
    }

    return () => {
      active = false;
    };
  }, [slug, rosterId]);

  const progressPercent = onboarding?.progress_pct ?? 0;

  const stageLabel = useMemo(() => {
    if (candidate?.employment_status === "Active") return "Active";
    if (candidate?.onboarding_completed_at || onboarding?.session_status === "completed") {
      return "Ready for Activation";
    }
    if (onboarding?.has_session) return "Onboarding";
    if (candidate?.invite_status === "Invited") return "Invited";
    return "Candidate Created";
  }, [candidate, onboarding]);

  const canActivate =
    candidate?.employment_status === "Candidate" &&
    Boolean(candidate?.onboarding_completed_at);

  const canInvite =
    candidate?.employment_status === "Candidate" &&
    candidate?.invite_status !== "Invited" &&
    !onboarding?.has_session;

  async function activateCandidate() {
    try {
      setActivating(true);
      setError(null);

      const res = await fetch(
        `/api/company/${slug}/people/roster/${rosterId}/activate`,
        {
          method: "POST",
          credentials: "include",
        }
      );

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error ?? "Failed to activate candidate.");
        return;
      }

      setCandidate((current) =>
        current
          ? {
              ...current,
              employment_status: "Active",
            }
          : current
      );
    } catch {
      setError("Failed to activate candidate.");
    } finally {
      setActivating(false);
    }
  }

  async function sendInvite() {
    try {
      setInviting(true);
      setError(null);

      const res = await fetch(
        `/api/company/${slug}/people/roster/${rosterId}/invite`,
        {
          method: "POST",
          credentials: "include",
        }
      );

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error ?? "Failed to send invite.");
        return;
      }

      setCandidate((current) =>
        current
          ? {
              ...current,
              invite_status: "Invited",
            }
          : current
      );

      setEvents((current) => [
        {
          id: `local-invite-${Date.now()}`,
          company_id: "",
          roster_id: rosterId,
          event_category: "onboarding",
          event_type: "invite_sent",
          event_detail: "Invite sent from candidate detail.",
          event_metadata: null,
          occurred_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
        ...current,
      ]);
    } catch {
      setError("Failed to send invite.");
    } finally {
      setInviting(false);
    }
  }

  return (
    <main className="landing-page">
      <SiteHeader />

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

          {error ? (
            <article className="value-card" style={{ gridColumn: "1 / -1" }}>
              <p style={{ color: "#c62828", margin: 0 }}>{error}</p>
            </article>
          ) : null}

          <DetailCard eyebrow="Candidate" title="Candidate identity">
            {loadingCandidate ? (
              <p className="value-card__body">Loading candidate...</p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                <div className="hero-stat">
                  <span className="hero-stat__label">Display name</span>
                  <strong>{candidate?.full_name ?? "—"}</strong>
                </div>

                <div className="hero-stat">
                  <span className="hero-stat__label">Roster ID</span>
                  <strong style={{ wordBreak: "break-word", lineHeight: 1.35 }}>
                    {candidate?.id ?? rosterId}
                  </strong>
                </div>

                <div className="hero-stat">
                  <span className="hero-stat__label">Role focus</span>
                  <strong>{candidate?.worker_type ?? "—"}</strong>
                </div>

                <div className="hero-stat">
                  <span className="hero-stat__label">Market</span>
                  <strong>{candidate?.market_code ?? "—"}</strong>
                </div>
              </div>
            )}
          </DetailCard>

          <DetailCard eyebrow="Status" title="Hiring posture">
            {loadingCandidate ? (
              <p className="value-card__body">Loading status...</p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                <div className="hero-stat">
                  <span className="hero-stat__label">Employment status</span>
                  <strong>{candidate?.employment_status ?? "—"}</strong>
                </div>

                <div className="hero-stat">
                  <span className="hero-stat__label">Invite status</span>
                  <strong>{candidate?.invite_status ?? "—"}</strong>
                </div>

                <div className="hero-stat">
                  <span className="hero-stat__label">Compliance posture</span>
                  <strong>{candidate?.compliance_summary ?? "—"}</strong>
                </div>

                <div className="hero-stat">
                  <span className="hero-stat__label">Current stage</span>
                  <strong>{stageLabel}</strong>
                </div>

                <div className="hero-stat">
                  <span className="hero-stat__label">Onboarding completed</span>
                  <strong>
                    {formatOptionalDate(candidate?.onboarding_completed_at ?? null)}
                  </strong>
                </div>
              </div>
            )}
          </DetailCard>

          <DetailCard eyebrow="Identifiers" title="Operational bridge fields">
            {loadingCandidate ? (
              <p className="value-card__body">Loading identifier posture...</p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                <div className="hero-stat">
                  <span className="hero-stat__label">FX ID</span>
                  <strong>Pending identifier data surface</strong>
                </div>

                <div className="hero-stat">
                  <span className="hero-stat__label">DSWID</span>
                  <strong>Leadership-managed bridge field</strong>
                </div>

                <div className="hero-stat">
                  <span className="hero-stat__label">Ownership rule</span>
                  <strong>BC / AO maintained</strong>
                </div>
              </div>
            )}
          </DetailCard>

          <article className="value-card" style={{ gridColumn: "1 / span 2" }}>
            <p className="value-card__eyebrow">Progress</p>
            <h3 className="value-card__title">Candidate progress</h3>
            <p className="value-card__body" style={{ marginTop: 8 }}>
              This View surface now shows the real onboarding progress and pending work.
            </p>

            <div style={{ marginTop: 18 }}>
              <div
                style={{
                  width: "100%",
                  height: 14,
                  borderRadius: 999,
                  background: "#eef2f7",
                  overflow: "hidden",
                  border: "1px solid #d6dfeb",
                }}
              >
                <div
                  style={{
                    width: `${progressPercent}%`,
                    height: "100%",
                    background: "#4a78ff",
                    borderRadius: 999,
                  }}
                />
              </div>

              <div
                style={{
                  marginTop: 8,
                  fontSize: 14,
                  fontWeight: 700,
                  color: "#17213a",
                }}
              >
                {progressPercent}% complete
              </div>
            </div>

            <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
              <div className="hero-stat">
                <span className="hero-stat__label">Onboarding session</span>
                <strong>
                  {loadingOnboarding
                    ? "Loading..."
                    : onboarding?.has_session
                      ? onboarding.session_status ?? "active"
                      : "Not started"}
                </strong>
              </div>

              <div className="hero-stat">
                <span className="hero-stat__label">Current step</span>
                <strong>
                  {loadingOnboarding
                    ? "Loading..."
                    : onboarding?.current_step ?? "—"}
                </strong>
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              {loadingOnboarding ? (
                <div>Loading onboarding progress...</div>
              ) : onboarding?.steps?.length ? (
                onboarding.steps.map((step) => (
                  <MilestoneRow
                    key={step.step_key}
                    label={step.label}
                    state={step.completed ? "complete" : "pending"}
                    detail={
                      step.completed
                        ? `Completed ${formatOptionalDate(step.completed_at)}`
                        : "Pending completion"
                    }
                  />
                ))
              ) : (
                <div>No onboarding session started.</div>
              )}
            </div>
          </article>

          <article className="value-card" style={{ gridColumn: "1 / span 2" }}>
            <p className="value-card__eyebrow">Lifecycle</p>
            <h3 className="value-card__title">Timeline</h3>
            <p className="value-card__body" style={{ marginTop: 8 }}>
              Live lifecycle events from <code>company_roster_event</code>.
            </p>

            {loadingEvents ? (
              <div style={{ paddingTop: 16 }}>Loading timeline...</div>
            ) : events.length === 0 ? (
              <div style={{ paddingTop: 16 }}>No lifecycle events found.</div>
            ) : (
              <div style={{ marginTop: 16 }}>
                {events.map((event) => (
                  <TimelineRow
                    key={event.id}
                    label={formatEventLabel(event.event_type)}
                    detail={event.event_detail ?? "No detail provided."}
                    timestamp={formatTimestamp(event.occurred_at)}
                  />
                ))}
              </div>
            )}
          </article>

          <DetailCard eyebrow="Actions" title="Next actions">
            <div className="cta-row">
              <button
                className="button"
                type="button"
                disabled={!canInvite || inviting}
                onClick={sendInvite}
              >
                {inviting ? "Sending..." : candidate?.invite_status === "Invited" ? "Invited" : "Send invite"}
              </button>
              <button className="button" type="button">
                Move stage
              </button>
              <button className="button" type="button">
                Add note
              </button>
              {canActivate ? (
                <button
                  className="button button-primary"
                  type="button"
                  disabled={activating}
                  onClick={activateCandidate}
                >
                  {activating ? "Activating..." : "Activate Candidate"}
                </button>
              ) : null}
            </div>

            {!loadingCandidate && candidate ? (
              <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                <div className="hero-stat">
                  <span className="hero-stat__label">Reports to</span>
                  <strong>{candidate.reports_to_name}</strong>
                </div>

                <div className="hero-stat">
                  <span className="hero-stat__label">Start date</span>
                  <strong>{candidate.hire_date}</strong>
                </div>
              </div>
            ) : null}
          </DetailCard>
        </div>
      </section>
    </main>
  );
}