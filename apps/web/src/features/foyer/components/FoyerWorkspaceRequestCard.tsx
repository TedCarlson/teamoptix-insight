"use client";

import { useEffect, useRef, useState } from "react";
import GovernedWorkspaceRequestForm from "./GovernedWorkspaceRequestForm";
import InsightSignal from "@/features/brand/components/InsightSignal";

export default function FoyerWorkspaceRequestCard({
  buttonLabel = "Start with Insight",
}: {
  buttonLabel?: string;
}) {
  const [requestOpen, setRequestOpen] = useState(false);
  const turnstileRef = useRef<HTMLDivElement | null>(null);
  const turnstileWidgetId = useRef<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileEnabled = process.env.NEXT_PUBLIC_TURNSTILE_ENABLED === "true";
  const turnstileSiteKey = turnstileEnabled
    ? process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ""
    : "";
  function resetCaptcha() {
    setCaptchaToken(null);
    window.turnstile?.reset(turnstileWidgetId.current ?? undefined);
  }

  useEffect(() => {
    if (!requestOpen || !turnstileSiteKey || !turnstileRef.current) return;

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
  }, [requestOpen, turnstileSiteKey]);

  return (
    <section className="foyer-workspace-request-card foyer-workspace-request-card--standalone">
      <p className="foyer-kicker">When you are ready...</p>
      <h3>Start with Insight.</h3>
      <p>
        Tell us a little about your operation. We&apos;ll use what you share to prepare
        a focused introduction around your business.
      </p>
      <p>
        You don&apos;t need to be great to start. You do need to start to be great.
      </p>
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
            onClick={() => setRequestOpen(false)}
          />

          <section className="foyer-request-overlay__panel">
            <div className="foyer-request-overlay__header">
              <div>
                <p className="foyer-kicker">Workspace request</p>
                <h2>Start with Insight.</h2>
              </div>
              <div className="foyer-request-overlay__brand"><InsightSignal phase="prospect" size="md" showWordmark /><button type="button" className="button" onClick={() => setRequestOpen(false)}>Close</button></div>
            </div>

            <>
              {turnstileSiteKey ? (
                <div
                  ref={turnstileRef}
                  className="signin-bridge__captcha"
                  aria-label="Security verification"
                />
              ) : null}
              <GovernedWorkspaceRequestForm captchaToken={captchaToken} captchaRequired={!!turnstileSiteKey} onCaptchaRejected={resetCaptcha} />
            </>
          </section>
        </div>
      ) : null}
    </section>
  );
}
