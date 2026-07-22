"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  answerFoyerQuestion,
  createFoyerConversationState,
  getCurrentFoyerQuestion,
} from "@/features/foyer/engine/conversation-engine";
import { routeFoyerExperience } from "@/features/foyer/engine/experience-router";
import type {
  FoyerConversationEntry,
  FoyerConversationState,
} from "@/features/foyer/models/conversation";
import GovernedWorkspaceRequestForm from "./GovernedWorkspaceRequestForm";
import InsightSignal from "@/features/brand/components/InsightSignal";

function answerText(entry: FoyerConversationEntry | undefined) {
  if (!entry) return "";
  return Array.isArray(entry.answer) ? entry.answer.join(", ") : entry.answer;
}

function findAnswer(state: FoyerConversationState, questionId: string) {
  return answerText(state.entries.find((entry) => entry.questionId === questionId));
}

export default function FoyerConversationPreview() {
  const [state, setState] = useState<FoyerConversationState>(() =>
    createFoyerConversationState()
  );
  const [answer, setAnswer] = useState("");
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

  const currentQuestion = getCurrentFoyerQuestion(state);
  const stories = useMemo(() => routeFoyerExperience(state), [state]);
  const isComplete = state.response.decision === "RECOMMEND_EXPERIENCES";

  const workspaceDefaults = useMemo(
    () => ({
      operation: findAnswer(state, "operation_intro"),
      routeCount: findAnswer(state, "route_count"),
      priorities: findAnswer(state, "primary_pressure"),
    }),
    [state]
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const cleaned = answer.trim();
    if (!cleaned) return;

    setState((current) => answerFoyerQuestion(current, cleaned));
    setAnswer("");
  }

  return (
    <section className="foyer-conversation-preview" id="operator-discovery">
      <div>
        <p className="foyer-kicker">Operator discovery</p>
        <h2>Before we show you Insight, tell us this.</h2>
        <p>If we could take one hat off your hook, which one would you hand us first?</p>
      </div>

      <div className="foyer-conversation-preview__panel">
        <div className="foyer-conversation-preview__thread">
          {state.entries.map((entry) => (
            <article key={`${entry.questionId}-${entry.answeredAt}`}>
              <p>{entry.prompt}</p>
              <strong>{answerText(entry)}</strong>
            </article>
          ))}

          {currentQuestion && !isComplete ? (
            <article className="foyer-conversation-preview__active">
              <p>{currentQuestion.prompt}</p>
            </article>
          ) : null}
        </div>

        {!isComplete ? (
          <form onSubmit={handleSubmit} className="foyer-conversation-preview__form">
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder="Payroll. Planning. Hiring. Or tell us what&apos;s weighing on your operation today."
              rows={4}
            />
            <div className="foyer-conversation-preview__actions">
              <span>Press Enter to continue. Shift + Enter adds a new line.</span>
              <button type="submit" className="button button-primary">
                Continue
              </button>
            </div>
          </form>
        ) : null}

        {state.response.acknowledgement ? (
          <article className="foyer-conversation-preview__ack">
            <p>Insight</p>
            <strong>{state.response.acknowledgement}</strong>
          </article>
        ) : null}

        {stories.length > 0 ? (
          <div className="foyer-conversation-preview__stories">
            <p className="foyer-kicker">You mentioned something we can show you</p>
            {stories.map((story) => (
              <article key={story.id}>
                <h3>{story.title}</h3>
                <p>{story.elevatorPitch}</p>
                <strong>{story.invitation}</strong>
              </article>
            ))}
          </div>
        ) : null}
      </div>

      <section className="foyer-workspace-request-card foyer-workspace-request-card--standalone">
        <p className="foyer-kicker">Start when you are ready</p>
        <h3>Let&apos;s build your workspace.</h3>
        <p>
          You can have the conversation first, or skip straight to the request.
          Either way, we&apos;ll use what you share to prepare a focused introduction
          around your operation.
        </p>
        <div className="cta-row" style={{ marginTop: 0 }}>
          <button
            type="button"
            className="button button-primary"
            onClick={() => setRequestOpen(true)}
          >
            Start My Workspace
          </button>
        </div>
      </section>

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
                <h2>Let&apos;s build your workspace.</h2>
              </div>
              <div className="foyer-request-overlay__brand"><InsightSignal phase="prospect" size="md" showWordmark /><button type="button" className="button" onClick={closeRequest}>Close</button></div>
            </div>

            {turnstileSiteKey ? <div ref={turnstileRef} className="signin-bridge__captcha" aria-label="Security verification" /> : null}
            <GovernedWorkspaceRequestForm
              requestCaptchaToken={turnstileSiteKey ? requestCaptchaToken : undefined}
              onSent={closeRequest}
              defaults={{
                "daily-ticket-volume": workspaceDefaults.routeCount,
                "current-dispatch-process": workspaceDefaults.operation,
              }}
            />
          </section>
        </div>
      ) : null}
    </section>
  );
}
