"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

function cleanBaseUrl(value: string) {
  return value.replace(/\/$/, "");
}

function SignInInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const invitedEmail = searchParams.get("email")?.trim() ?? "";
  const returnTo = searchParams.get("returnTo")?.trim() ?? "";
  const urlError = searchParams.get("error")?.trim() ?? "";

  const [email, setEmail] = useState(invitedEmail || "");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(urlError || null);

  useEffect(() => {
    if (invitedEmail) {
      setEmail(invitedEmail);
    }
  }, [invitedEmail]);

  const nextHref = useMemo(() => {
    return returnTo || "/profile";
  }, [returnTo]);

  const appBaseUrl = useMemo(() => {
    return cleanBaseUrl(
      process.env.NEXT_PUBLIC_APP_URL || window.location.origin
    );
  }, []);

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

      const callbackUrl = `${appBaseUrl}/auth/callback?next=${encodeURIComponent(
        nextHref
      )}&setPassword=1`;

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: callbackUrl,
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

  async function handlePasswordRecovery() {
    setSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch("/api/auth/password-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          email,
          returnTo: nextHref,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.error ?? "Failed to send password setup link.");
        return;
      }

      setMessage("Password setup link sent. Check your email.");
    } catch {
      setError("Unexpected password setup error.");
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
          Sign in with your password, request a magic link, or send yourself a password setup link.
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
              disabled={submitting || !email || !password}
            >
              {submitting ? "Signing in..." : "Sign in"}
            </button>

            <button
              className="button"
              type="button"
              onClick={handleMagicLink}
              disabled={submitting || !email}
            >
              Send magic link
            </button>

            <button
              className="button"
              type="button"
              onClick={handlePasswordRecovery}
              disabled={submitting || !email}
            >
              Set or reset password
            </button>
          </div>
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
            <h1>Loading sign in…</h1>
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
