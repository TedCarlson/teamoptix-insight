"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import SiteHeader from "@/features/landing/components/SiteHeader";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

function SetPasswordInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo")?.trim() || "/profile";
  const code = searchParams.get("code")?.trim() ?? "";

  const [sessionReady, setSessionReady] = useState(false);
  const [sessionChecking, setSessionChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function prepareSession() {
      try {
        setSessionChecking(true);
        setError(null);

        const supabase = getSupabaseBrowserClient();

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);

          if (error) {
            setError(error.message);
            setSessionReady(false);
            return;
          }

          if (active) {
            router.replace(`/set-password?returnTo=${encodeURIComponent(returnTo)}`);
          }
        }

        const { data } = await supabase.auth.getSession();

        if (!active) return;

        if (!data.session) {
          setError("Password setup link is missing or expired. Please request a new password setup link.");
          setSessionReady(false);
          return;
        }

        setSessionReady(true);
      } catch {
        if (!active) return;
        setError("Failed to prepare password setup session.");
        setSessionReady(false);
      } finally {
        if (active) setSessionChecking(false);
      }
    }

    void prepareSession();

    return () => {
      active = false;
    };
  }, [code, returnTo, router]);

  const canSubmit = useMemo(() => {
    return password.length >= 8 && password === confirmPassword;
  }, [password, confirmPassword]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      if (password.length < 8) {
        setError("Password must be at least 8 characters.");
        return;
      }

      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }

      const supabase = getSupabaseBrowserClient();

      const { error } = await supabase.auth.updateUser({
        password,
      });

      if (error) {
        setError(error.message);
        return;
      }

      setMessage("Password saved.");
      router.refresh();
      router.push(returnTo);
    } catch {
      setError("Failed to set password.");
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
            <p className="value-card__eyebrow">Account Access</p>
            <h2 className="value-card__title">Set your password</h2>
            <p className="value-card__body">
              Create or reset your password so you can sign in directly next time.
            </p>

            <form onSubmit={handleSubmit} style={{ marginTop: 14 }}>
              <div style={{ display: "grid", gap: 12 }}>
                <input
                  type="password"
                  placeholder="New password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  style={inputStyle}
                />

                <input
                  type="password"
                  placeholder="Confirm password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  style={inputStyle}
                />
              </div>

              {message ? (
                <p style={{ color: "#2e7d32", marginTop: 14 }}>{message}</p>
              ) : null}

              {sessionChecking ? (
                <p style={{ color: "#5c6b84", marginTop: 14 }}>
                  Preparing secure password session…
                </p>
              ) : null}

              {error ? (
                <p style={{ color: "#c62828", marginTop: 14 }}>{error}</p>
              ) : null}

              <div className="cta-row" style={{ marginTop: 18 }}>
                <button
                  className="button button-primary"
                  type="submit"
                  disabled={submitting || sessionChecking || !sessionReady || !canSubmit}
                >
                  {submitting ? "Saving..." : "Set password"}
                </button>

                <button
                  className="button"
                  type="button"
                  onClick={() => router.push(returnTo)}
                  disabled={submitting}
                >
                  Skip for now
                </button>
              </div>
            </form>
          </article>
        </div>
      </section>
    </main>
  );
}

export default function SetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="page-shell">
          <section className="panel">
            <p className="eyebrow">Account Access</p>
            <h1>Loading password setup…</h1>
          </section>
        </main>
      }
    >
      <SetPasswordInner />
    </Suspense>
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
