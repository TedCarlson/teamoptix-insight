"use client";

import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export default function SignInPage() {
  const [email, setEmail] = useState("admin@teamoptix.io");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        setSubmitting(false);
        return;
      }

      setMessage("Signed in successfully. You can now refresh session and access checks.");
    } catch (err) {
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

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: window.location.origin,
        },
      });

      if (error) {
        setError(error.message);
        setSubmitting(false);
        return;
      }

      setMessage("Magic link sent. Check your email.");
    } catch (err) {
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
          Sign in with your existing account to begin resolving your platform access.
        </p>

        <form onSubmit={handlePasswordSignIn} style={{ marginTop: 24 }}>
          <div style={{ display: "grid", gap: 12 }}>
            <input
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                width: "100%",
                height: 46,
                padding: "0 14px",
                borderRadius: 12,
                border: "1px solid #d6dfeb",
                background: "#fff",
              }}
            />

            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{
                width: "100%",
                height: 46,
                padding: "0 14px",
                borderRadius: 12,
                border: "1px solid #d6dfeb",
                background: "#fff",
              }}
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
