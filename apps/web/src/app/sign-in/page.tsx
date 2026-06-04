"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

function SignInInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const invitedEmail = searchParams.get("email")?.trim() ?? "";
  const returnTo = searchParams.get("returnTo")?.trim() ?? "";

  const [email, setEmail] = useState(invitedEmail || "admin@teamoptix.io");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (invitedEmail) {
      setEmail(invitedEmail);
    }
  }, [invitedEmail]);

  const nextHref = useMemo(() => {
    return returnTo || "/profile";
  }, [returnTo]);

  async function handlePasswordSignIn(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      const supabase = getSupabaseBrowserClient();

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setError(error.message);
        return;
      }

      router.refresh();
      router.push(nextHref);
    } catch {
      setError("Unexpected sign-in error.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMagicLink() {
    setSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      const supabase = getSupabaseBrowserClient();

      const appBaseUrl =
        process.env.NEXT_PUBLIC_APP_URL ||
        process.env.NEXT_PUBLIC_SITE_URL ||
        window.location.origin;

      const redirectTarget = `${appBaseUrl.replace(/\/$/, "")}${nextHref}`;

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: redirectTarget,
        },
      });

      if (error) {
        setError(error.message);
        return;
      }

      setMessage("Magic link sent. Check your email.");
    } catch {
      setError("Unexpected magic link error.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="page-shell">
      <section className="panel">
        <p className="eyebrow">Auth</p>
        <h1>Sign in</h1>
        <p className="lede">
          Sign in with your existing account to continue into your app workspace or onboarding flow.
        </p>

        {returnTo ? (
          <p style={{ marginTop: 12, color: "#5c6b84" }}>
            After sign-in, you will continue to: <strong>{nextHref}</strong>
          </p>
        ) : null}

        <form onSubmit={handlePasswordSignIn} style={{ marginTop: 24 }}>
          <div style={{ display: "grid", gap: 12 }}>
            <input
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={inputStyle}
            />

            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={inputStyle}
            />
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              marginTop: 16,
            }}
          >
            <button
              className="button button-primary"
              type="submit"
              disabled={submitting}
            >
              {submitting ? "Signing in..." : "Sign in"}
            </button>

            <button
              className="button"
              type="button"
              onClick={handleMagicLink}
              disabled={submitting}
            >
              Send magic link instead
            </button>
          </div>

          {message ? (
            <p style={{ color: "#0f9f6e", marginTop: 14 }}>{message}</p>
          ) : null}

          {error ? (
            <p style={{ color: "#c62828", marginTop: 14 }}>{error}</p>
          ) : null}
        </form>
      </section>
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <main className="page-shell">
          <section className="panel">
            <p className="eyebrow">Auth</p>
            <h1>Loading sign-in…</h1>
          </section>
        </main>
      }
    >
      <SignInInner />
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
