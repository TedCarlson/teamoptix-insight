"use client";

import { useEffect, useRef, useState } from "react";
import GovernedWorkspaceRequestForm from "./GovernedWorkspaceRequestForm";
import InsightSignal from "@/features/brand/components/InsightSignal";

export default function FoyerWorkspaceRequestCard({
  buttonLabel = "Start with Insight",
  kicker = "When you are ready...",
  title = "Start with Insight.",
  intro = "Tell us a little about your operation. We'll use what you share to prepare a focused introduction around your business.",
  supportingText = "You don't need to be great to start. You do need to start to be great.",
}: {
  buttonLabel?: string;
  kicker?: string;
  title?: string;
  intro?: string;
  supportingText?: string;
}) {
  const [requestOpen, setRequestOpen] = useState(false);
  const turnstileRef = useRef<HTMLDivElement | null>(null);
  const turnstileWidgetId = useRef<string | null>(null);
  const captchaResolver = useRef<((token: string) => void) | null>(null);
  const captchaRejecter = useRef<((reason?: unknown) => void) | null>(null);
  const turnstileEnabled = process.env.NEXT_PUBLIC_TURNSTILE_ENABLED === "true";
  const turnstileSiteKey = turnstileEnabled
    ? process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ""
    : "";
  function requestCaptchaToken() {
    if (!turnstileSiteKey) return Promise.resolve("");
    return new Promise<string>((resolve, reject) => {
      if (!window.turnstile || !turnstileWidgetId.current) { reject(new Error("Security verification is not ready.")); return; }
      captchaResolver.current = resolve;
      captchaRejecter.current = reject;
      window.turnstile.reset(turnstileWidgetId.current);
      window.turnstile.execute(turnstileWidgetId.current);
    });
  }
  function closeRequest() {
    if (turnstileWidgetId.current) window.turnstile?.remove(turnstileWidgetId.current);
    turnstileWidgetId.current = null;
    captchaResolver.current = null;
    captchaRejecter.current = null;
    setRequestOpen(false);
  }

  useEffect(() => {
    if (!requestOpen || !turnstileSiteKey || !turnstileRef.current) return;

    function renderTurnstile() {
      const turnstile = window.turnstile;
      if (!turnstile || !turnstileRef.current || turnstileWidgetId.current) return;

      turnstileWidgetId.current = turnstile.render(turnstileRef.current, {
        sitekey: turnstileSiteKey,
        execution: "execute",
        appearance: "interaction-only",
        callback: (token: string) => { captchaResolver.current?.(token); captchaResolver.current = null; captchaRejecter.current = null; },
        "expired-callback": () => { captchaRejecter.current?.(new Error("Security verification expired.")); captchaResolver.current = null; captchaRejecter.current = null; },
        "error-callback": () => { captchaRejecter.current?.(new Error("Security verification failed.")); captchaResolver.current = null; captchaRejecter.current = null; },
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
  }, [requestOpen, turnstileSiteKey]);

  return (
    <section className="foyer-workspace-request-card foyer-workspace-request-card--standalone">
      <p className="foyer-kicker">{kicker}</p>
      <h3>{title}</h3>
      <p>{intro}</p>
      <p>{supportingText}</p>
      <div className="cta-row" style={{ marginTop: 0 }}>
        <button
          type="button"
          className="button button-primary"
          onClick={() => setRequestOpen(true)}
        >
          {buttonLabel}
        </button>
      </div>

      {requestOpen ? (
        <div className="foyer-request-overlay" role="dialog" aria-modal="true">
          <button
            type="button"
            className="foyer-request-overlay__backdrop"
            aria-label="Close workspace request"
            onClick={closeRequest}
          />

          <section className="foyer-request-overlay__panel">
            <div className="foyer-request-overlay__header">
              <div>
                <p className="foyer-kicker">Workspace request</p>
                <h2>Start with Insight.</h2>
              </div>
              <div className="foyer-request-overlay__brand"><InsightSignal phase="prospect" size="md" showWordmark /><button type="button" className="button" onClick={closeRequest}>Close</button></div>
            </div>

            <>
              {turnstileSiteKey ? (
                <div
                  ref={turnstileRef}
                  className="signin-bridge__captcha"
                  aria-label="Security verification"
                />
              ) : null}
              <GovernedWorkspaceRequestForm requestCaptchaToken={turnstileSiteKey ? requestCaptchaToken : undefined} onSent={closeRequest} />
            </>
          </section>
        </div>
      ) : null}
    </section>
  );
}
