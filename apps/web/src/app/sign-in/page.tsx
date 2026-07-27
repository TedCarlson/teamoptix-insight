"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

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
  const [unknownAccountEmail, setUnknownAccountEmail] = useState<string | null>(null);
  const turnstileRef = useRef<HTMLDivElement | null>(null);
  const turnstileWidgetId = useRef<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileEnabled =
    process.env.NEXT_PUBLIC_TURNSTILE_ENABLED === "true";
  const turnstileSiteKey = turnstileEnabled
    ? process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ""
    : "";

  useEffect(() => {
    if (invitedEmail) {
      setEmail(invitedEmail);
    }
  }, [invitedEmail]);

  useEffect(() => {
    if (!turnstileSiteKey || !turnstileRef.current) return;

    function renderTurnstile() {
      const turnstile = window.turnstile;
      if (!turnstile || !turnstileRef.current || turnstileWidgetId.current) return;

      turnstileWidgetId.current = turnstile.render(turnstileRef.current, {
        sitekey: turnstileSiteKey,
        callback: (token: string) => setCaptchaToken(token),
        "expired-callback": () => setCaptchaToken(null),
        "error-callback": () => setCaptchaToken(null),
      });
    }

    if (window.turnstile) {
      renderTurnstile();
      return;
    }

    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src="https://challenges.cloudflare.com/turnstile/v0/api.js"]'
    );

    if (existingScript) {
      existingScript.addEventListener("load", renderTurnstile, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    script.async = true;
    script.defer = true;
    script.addEventListener("load", renderTurnstile, { once: true });
    document.body.appendChild(script);

    return () => {
      script.removeEventListener("load", renderTurnstile);
    };
  }, [turnstileSiteKey]);

  const nextHref = useMemo(() => {
    return returnTo || "/profile";
  }, [returnTo]);

  async function handlePasswordSignIn(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setMessage(null);
    setUnknownAccountEmail(null);

    try {
      const response = await fetch("/api/auth/password-sign-in", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.ok) {
        setError(
          typeof data?.error === "string" && data.error.trim()
            ? data.error
            : "Unable to complete sign-in."
        );
        window.turnstile?.reset(turnstileWidgetId.current ?? undefined);
        setCaptchaToken(null);
        return;
      }

      window.location.assign(nextHref);
    } catch (reason) {
      setError(
        reason instanceof Error && reason.message
          ? reason.message
          : "Unable to complete sign-in."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function sendAccountLink(successMessage: string, fallbackError: string) {
    setSubmitting(true);
    setError(null);
    setMessage(null);
    setUnknownAccountEmail(null);

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
          captchaToken,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.error ?? fallbackError);
        window.turnstile?.reset(turnstileWidgetId.current ?? undefined);
        setCaptchaToken(null);
        if (data?.redirectTo) {
          setUnknownAccountEmail(email);
          window.setTimeout(() => router.push(data.redirectTo), 3200);
        }
        return;
      }

      setMessage(successMessage);
      window.turnstile?.reset(turnstileWidgetId.current ?? undefined);
      setCaptchaToken(null);
    } catch {
      window.turnstile?.reset(turnstileWidgetId.current ?? undefined);
      setCaptchaToken(null);
      setError(fallbackError);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="signin-bridge-page">
      <section className="signin-bridge">
        <div className="signin-bridge__brand">
          <Link className="signin-bridge__back" href="/">
            ← Return to Team Optix
          </Link>

          <div className="signin-bridge__lockup">
            <Image
              src="/icons/logo-2-insight-cutout.png"
              alt="Insight"
              width={132}
              height={132}
              priority
            />
            <div>
              <strong>Insight</strong>
              <span>by Team Optix</span>
            </div>
          </div>

          <div className="foyer-product-lockup__rule" />

          <p className="foyer-kicker">Existing Insight Users</p>
          <h1>Welcome back.</h1>
          <p>
            Secure access for operators, teams, and invited users already connected
            to an Insight workspace.
          </p>

          <div className="signin-bridge__actions">
            <Link className="button button-primary" href="/company-owner">
              Start with Insight
            </Link>
          </div>
        </div>

        <section className="signin-bridge__panel">
          <p className="eyebrow">Existing Insight Users</p>
          <h2>Sign in to your workspace.</h2>
          <p className="lede">
            Use the email address associated with your existing Insight account.
          </p>

          {returnTo ? (
            <p className="signin-bridge__return">
              After sign-in, you will continue to: <strong>{nextHref}</strong>
            </p>
          ) : null}

          <form onSubmit={handlePasswordSignIn} className="signin-bridge__form">
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

            {turnstileSiteKey ? (
              <div
                ref={turnstileRef}
                className="signin-bridge__captcha"
                aria-label="Security verification"
              />
            ) : null}

            {unknownAccountEmail ? (
              <div className="signin-bridge__notice" role="status">
                <strong>We could not find an Insight account for {unknownAccountEmail}.</strong>
                <span>
                  If you are evaluating Insight for your operation, start with Team Optix
                  and request a workspace. Returning you to Team Optix…
                </span>
              </div>
            ) : null}

            {message ? (
              <p className="signin-bridge__success">{message}</p>
            ) : null}

            {error ? (
              <p className="signin-bridge__error">{error}</p>
            ) : null}

            <div className="cta-row signin-bridge__form-actions">
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
                onClick={() =>
                  sendAccountLink(
                    "Magic link sent. Check your email.",
                    "Unable to send magic link."
                  )
                }
                disabled={submitting || !email || (!!turnstileSiteKey && !captchaToken)}
              >
                Send magic link
              </button>

              <button
                className="button"
                type="button"
                onClick={() =>
                  sendAccountLink(
                    "Password setup link sent. Check your email.",
                    "Unable to send password setup link."
                  )
                }
                disabled={submitting || !email || (!!turnstileSiteKey && !captchaToken)}
              >
                Set or reset password
              </button>
            </div>

            <p className="signin-bridge__helper">
              Magic links and password setup links are available only for registered
              Insight users.
            </p>
          </form>
        </section>


      </section>
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <main className="signin-bridge-page">
          <section className="signin-bridge__panel">
            <p className="eyebrow">Existing Insight Users</p>
            <h1>Loading sign in…</h1>
          </section>
        </main>
      }
    >
      <SignInInner />
    </Suspense>
  );
}

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          execution?: "render" | "execute";
          appearance?: "always" | "execute" | "interaction-only";
          callback: (token: string) => void;
          "expired-callback": () => void;
          "error-callback": () => void;
        }
      ) => string;
      reset: (widgetId?: string) => void;
      execute: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 46,
  padding: "0 14px",
  borderRadius: 12,
  border: "1px solid #d6dfeb",
  background: "#fff",
};
