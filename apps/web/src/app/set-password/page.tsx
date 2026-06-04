"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import SiteHeader from "@/features/landing/components/SiteHeader";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

function SetPasswordInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo")?.trim() || "/profile";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

              {error ? (
                <p style={{ color: "#c62828", marginTop: 14 }}>{error}</p>
              ) : null}

              <div className="cta-row" style={{ marginTop: 18 }}>
                <button
                  className="button button-primary"
                  type="submit"
                  disabled={submitting || !canSubmit}
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
