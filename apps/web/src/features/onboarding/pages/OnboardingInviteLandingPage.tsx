"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import SiteHeader from "@/features/landing/components/SiteHeader";

type InviteRecord = {
  id: string;
  candidate_id: string;
  pc_org_id: string;
  email: string;
  token: string;
  status: "active" | "expired" | "used" | "revoked" | string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
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

function StepRow(props: {
  step: string;
  title: string;
  detail: string;
}) {
  const { step, title, detail } = props;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "72px 1fr",
        gap: 12,
        alignItems: "start",
        padding: "12px 0",
        borderBottom: "1px solid #e6edf5",
      }}
    >
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: 56,
          width: "fit-content",
          padding: "6px 10px",
          borderRadius: 999,
          border: "1px solid #d6dfeb",
          background: "#eef4ff",
          color: "#2f61d5",
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
        }}
      >
        {step}
      </div>

      <div>
        <div style={{ fontWeight: 700, color: "#17213a" }}>{title}</div>
        <div style={{ marginTop: 4, color: "#5c6b84", fontSize: 14 }}>
          {detail}
        </div>
      </div>
    </div>
  );
}

function formatExpiry(value: string) {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export default function OnboardingInviteLandingPage() {
  const params = useParams();
  const token = String(params?.token ?? "");

  const [inviteState, setInviteState] = useState<
    "loading" | "valid" | "invalid"
  >("loading");
  const [invite, setInvite] = useState<InviteRecord | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    let active = true;

    async function validateInvite() {
      try {
        setInviteState("loading");
        setErrorText(null);

        const res = await fetch(
          `/api/hiring/invite/validate?token=${encodeURIComponent(token)}`,
          { credentials: "include" }
        );

        const data = await res.json();

        if (!active) return;

        if (!res.ok) {
          setInvite(null);
          setInviteState("invalid");
          setErrorText(data?.error ?? "Invalid or expired invite");
          return;
        }

        setInvite(data.invite as InviteRecord);
        setInviteState("valid");
      } catch {
        if (!active) return;
        setInvite(null);
        setInviteState("invalid");
        setErrorText("Failed to validate invite");
      }
    }

    if (!token) {
      setInviteState("invalid");
      setErrorText("Missing invite token");
      return;
    }

    validateInvite();

    return () => {
      active = false;
    };
  }, [token]);

  async function startOnboarding() {
    try {
      setStarting(true);
      setErrorText(null);

      const res = await fetch("/api/onboarding/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ token }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorText(data?.error ?? "Failed to start onboarding");
        return;
      }

      window.location.assign(`/onboarding/start/${data.session_id}`);
    } catch {
      setErrorText("Failed to start onboarding");
    } finally {
      setStarting(false);
    }
  }

  const tokenPosture = useMemo(() => {
    if (inviteState === "loading") return "Validating invite…";
    if (inviteState === "valid") return "Invite verified";
    return errorText ?? "Invalid or expired invite";
  }, [inviteState, errorText]);

  const entryState = useMemo(() => {
    if (starting) return "Starting onboarding session";
    if (inviteState === "valid") return "Ready for onboarding start";
    if (inviteState === "loading") return "Checking invite";
    return "Invite validation required";
  }, [inviteState, starting]);

  return (
    <main className="landing-page">
      <SiteHeader />

      <section className="value-strip">
        <div className="value-grid">
          <article className="value-card" style={{ gridColumn: "1 / -1" }}>
            <p className="value-card__eyebrow">Onboarding</p>
            <h2 className="value-card__title">You’ve been invited</h2>
            <p className="value-card__body">
              This is the onboarding entry surface a candidate reaches from an
              invite link. This version validates the invite token and begins a
              real onboarding session when the user continues.
            </p>

            <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
              <div className="hero-stat">
                <span className="hero-stat__label">Invite token</span>
                <strong
                  style={{
                    wordBreak: "break-word",
                    lineHeight: 1.35,
                  }}
                >
                  {token || "Missing token"}
                </strong>
              </div>

              <div className="hero-stat">
                <span className="hero-stat__label">Token posture</span>
                <strong>{tokenPosture}</strong>
              </div>

              <div className="hero-stat">
                <span className="hero-stat__label">Entry state</span>
                <strong>{entryState}</strong>
              </div>

              {invite ? (
                <>
                  <div className="hero-stat">
                    <span className="hero-stat__label">Invite email</span>
                    <strong>{invite.email}</strong>
                  </div>

                  <div className="hero-stat">
                    <span className="hero-stat__label">Expires</span>
                    <strong>{formatExpiry(invite.expires_at)}</strong>
                  </div>
                </>
              ) : null}
            </div>

            {errorText && inviteState !== "valid" ? (
              <p style={{ marginTop: 14, color: "#c62828" }}>{errorText}</p>
            ) : null}

            <div className="cta-row" style={{ marginTop: 14 }}>
              <button
                className="button button-primary"
                type="button"
                disabled={inviteState !== "valid" || starting}
                onClick={startOnboarding}
              >
                {starting ? "Starting…" : "Begin onboarding"}
              </button>

              <Link className="button" href="/">
                Back to home
              </Link>
            </div>
          </article>

          <DetailCard
            eyebrow="Invitation"
            title="What this invite means"
            body="You have been invited into a company onboarding flow. This process will eventually connect your profile, documents, and readiness steps to the company’s candidate workflow."
          />

          <DetailCard
            eyebrow="Expected steps"
            title="What you will complete"
          >
            <StepRow
              step="1"
              title="Claim your access"
              detail="Authenticate and connect this invite to your platform identity."
            />
            <StepRow
              step="2"
              title="Complete your profile"
              detail="Provide the personal and contact details needed to move through onboarding."
            />
            <StepRow
              step="3"
              title="Finish onboarding tasks"
              detail="Complete company and compliance-driven steps such as required forms or supporting items."
            />
          </DetailCard>

          <DetailCard
            eyebrow="Candidate progress"
            title="How this affects your status"
            body="This invite is the beginning of the candidate journey inside Insight. Future versions of this page will show your progress, missing items, and completion posture in real time."
          />

          <DetailCard
            eyebrow="Safety"
            title="Invite handling posture"
          >
            <div style={{ display: "grid", gap: 10 }}>
              <div className="hero-stat">
                <span className="hero-stat__label">Single-use expectation</span>
                <strong>Invite links are treated as one-time entry links</strong>
              </div>

              <div className="hero-stat">
                <span className="hero-stat__label">Expired or used link</span>
                <strong>
                  Invalid, expired, or used invites are blocked before onboarding begins
                </strong>
              </div>
            </div>
          </DetailCard>

          <article className="value-card" style={{ gridColumn: "1 / -1" }}>
            <p className="value-card__eyebrow">Onboarding shell</p>
            <h3 className="value-card__title">What comes next</h3>
            <p className="value-card__body" style={{ marginTop: 8 }}>
              The next implementation slice will connect the onboarding session
              to the first true onboarding form and then use that session state
              to drive candidate progress automatically.
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}