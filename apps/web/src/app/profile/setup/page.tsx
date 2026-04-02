"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAccess } from "@/features/access/AccessProvider";
import SiteHeader from "@/features/landing/components/SiteHeader";

export default function ProfileSetupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const access = useAccess();

  const sessionId = searchParams.get("sessionId")?.trim() ?? "";
  const returnTo = searchParams.get("returnTo")?.trim() ?? "";

  const [firstName, setFirstName] = useState(access.first_name ?? "");
  const [lastName, setLastName] = useState(access.last_name ?? "");
  const [displayName, setDisplayName] = useState(access.display_name ?? "");
  const [mobilePhone, setMobilePhone] = useState(access.mobile_phone ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!firstName && access.first_name) setFirstName(access.first_name);
    if (!lastName && access.last_name) setLastName(access.last_name);
    if (!displayName && access.display_name) setDisplayName(access.display_name);
    if (!mobilePhone && access.mobile_phone) setMobilePhone(access.mobile_phone);
  }, [access.first_name, access.last_name, access.display_name, access.mobile_phone, firstName, lastName, displayName, mobilePhone]);

  const nextHref = useMemo(() => {
    if (returnTo) return returnTo;
    if (sessionId) return `/onboarding/start/${sessionId}`;
    return "/profile";
  }, [returnTo, sessionId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch("/api/profile/setup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          session_id: sessionId || null,
          first_name: firstName,
          last_name: lastName,
          display_name: displayName,
          mobile_phone: mobilePhone,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.error ?? "Failed to save profile.");
        return;
      }

      setMessage("Profile saved.");
      router.refresh();
      router.push(nextHref);
    } catch {
      setError("Failed to save profile.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="landing-page">
      <SiteHeader />

      <section className="value-strip">
        <div className="value-grid">
          <article className="value-card" style={{ gridColumn: "1 / -1" }}>
            <p className="value-card__eyebrow">Profile</p>
            <h2 className="value-card__title">Complete your profile</h2>
            <p className="value-card__body">
              This is the required identity setup step for app access and onboarding completion.
            </p>

            <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
              <div className="hero-stat">
                <span className="hero-stat__label">Signed-in email</span>
                <strong>{access.email ?? "Not available"}</strong>
              </div>

              {sessionId ? (
                <div className="hero-stat">
                  <span className="hero-stat__label">Onboarding session</span>
                  <strong style={{ wordBreak: "break-word" }}>{sessionId}</strong>
                </div>
              ) : null}
            </div>
          </article>

          <article className="value-card" style={{ gridColumn: "1 / -1" }}>
            <p className="value-card__eyebrow">Setup</p>
            <h3 className="value-card__title">Profile details</h3>

            <form onSubmit={handleSubmit} style={{ marginTop: 14 }}>
              <div style={{ display: "grid", gap: 12 }}>
                <input
                  type="text"
                  placeholder="First name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  style={inputStyle}
                />

                <input
                  type="text"
                  placeholder="Last name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  style={inputStyle}
                />

                <input
                  type="text"
                  placeholder="Display name (optional)"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  style={inputStyle}
                />

                <input
                  type="text"
                  placeholder="Mobile phone (optional)"
                  value={mobilePhone}
                  onChange={(e) => setMobilePhone(e.target.value)}
                  style={inputStyle}
                />
              </div>

              {message ? (
                <p style={{ color: "#2e7d32", marginTop: 14 }}>{message}</p>
              ) : null}

              {error ? (
                <p style={{ color: "#c62828", marginTop: 14 }}>{error}</p>
              ) : null}

              <div className="cta-row" style={{ marginTop: 18 }}>
                <button
                  className="button button-primary"
                  type="submit"
                  disabled={submitting}
                >
                  {submitting ? "Saving..." : "Save profile"}
                </button>
              </div>
            </form>
          </article>
        </div>
      </section>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 46,
  padding: "0 14px",
  borderRadius: 12,
  border: "1px solid #d6dfeb",
  background: "#fff",
};
