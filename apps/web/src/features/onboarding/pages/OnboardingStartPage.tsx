"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import SiteHeader from "@/features/landing/components/SiteHeader";

type OnboardingStepRow = {
  step_key: string;
  label: string;
  step_order: number;
  completed: boolean;
  completed_at: string | null;
};

function StepCard(props: {
  eyebrow: string;
  title: string;
  body: string;
  state: "complete" | "current" | "pending";
  action?: React.ReactNode;
}) {
  const { eyebrow, title, body, state, action } = props;

  const badgeText =
    state === "complete"
      ? "Complete"
      : state === "current"
        ? "Current"
        : "Pending";

  return (
    <article className="value-card">
      <p className="value-card__eyebrow">{eyebrow}</p>
      <h3 className="value-card__title">{title}</h3>
      <p className="value-card__body">{body}</p>

      <div style={{ marginTop: 14 }} className="hero-stat">
        <span className="hero-stat__label">Status</span>
        <strong>{badgeText}</strong>
      </div>

      {action ? <div style={{ marginTop: 14 }}>{action}</div> : null}
    </article>
  );
}

export default function OnboardingStartPage() {
  const params = useParams();
  const sessionId = String(params?.sessionId ?? "");

  const [steps, setSteps] = useState<OnboardingStepRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingStepKey, setSavingStepKey] = useState<string | null>(null);
  const [sessionComplete, setSessionComplete] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadSteps() {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(
          `/api/onboarding/session/${sessionId}/steps`,
          { credentials: "include" }
        );

        const data = await res.json();

        if (!active) return;

        if (!res.ok) {
          setError(data?.error ?? "Failed to load onboarding steps.");
          setSteps([]);
          return;
        }

        setSteps((data?.steps ?? []) as OnboardingStepRow[]);
      } catch {
        if (!active) return;
        setError("Failed to load onboarding steps.");
        setSteps([]);
      } finally {
        if (active) setLoading(false);
      }
    }

    if (sessionId) loadSteps();

    return () => {
      active = false;
    };
  }, [sessionId]);

  const progress = useMemo(() => {
    if (steps.length === 0) return 0;
    const completed = steps.filter((step) => step.completed).length;
    return Math.round((completed / steps.length) * 100);
  }, [steps]);

  const cards = useMemo(() => {
    let currentAssigned = false;

    return steps.map((step) => {
      let state: "complete" | "current" | "pending" = "pending";

      if (step.completed) {
        state = "complete";
      } else if (!currentAssigned) {
        state = "current";
        currentAssigned = true;
      }

      return {
        ...step,
        state,
      };
    });
  }, [steps]);

  function bodyForStep(stepKey: string) {
    if (stepKey === "profile") {
      return "Candidates will enter their personal information and confirm contact details required for the hiring process.";
    }
    if (stepKey === "documents") {
      return "Identity and compliance documents will be uploaded and verified.";
    }
    if (stepKey === "confirmation") {
      return "Candidates will confirm readiness and complete onboarding.";
    }
    return "Onboarding step ready for implementation.";
  }

  async function completeStep(stepKey: string) {
    try {
      setSavingStepKey(stepKey);
      setError(null);

      const res = await fetch(
        `/api/onboarding/session/${sessionId}/steps/${stepKey}/complete`,
        {
          method: "POST",
          credentials: "include",
        }
      );

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error ?? "Failed to complete onboarding step.");
        return;
      }

      const nextSteps = steps.map((step) =>
        step.step_key === stepKey
          ? {
              ...step,
              completed: true,
              completed_at: new Date().toISOString(),
            }
          : step
      );

      setSteps(nextSteps);

      const allComplete = nextSteps.every((step) => step.completed);

      if (allComplete) {
        const completeRes = await fetch(
          `/api/onboarding/session/${sessionId}/complete`,
          {
            method: "POST",
            credentials: "include",
          }
        );

        const completeData = await completeRes.json();

        if (!completeRes.ok) {
          setError(completeData?.error ?? "Failed to complete onboarding.");
          return;
        }

        setSessionComplete(true);
      }
    } catch {
      setError("Failed to complete onboarding step.");
    } finally {
      setSavingStepKey(null);
    }
  }

  function actionForStep(step: {
    step_key: string;
    completed: boolean;
    state: "complete" | "current" | "pending";
  }) {
    if (step.completed) return undefined;
    if (step.state !== "current") return undefined;

    if (step.step_key === "profile") {
      return (
        <button
          className="button button-primary"
          type="button"
          disabled={savingStepKey === step.step_key}
          onClick={() => completeStep(step.step_key)}
        >
          {savingStepKey === step.step_key
            ? "Saving..."
            : "Complete Profile Setup"}
        </button>
      );
    }

    if (step.step_key === "documents") {
      return (
        <button
          className="button button-primary"
          type="button"
          disabled={savingStepKey === step.step_key}
          onClick={() => completeStep(step.step_key)}
        >
          {savingStepKey === step.step_key
            ? "Saving..."
            : "Complete Required Documents"}
        </button>
      );
    }

    if (step.step_key === "confirmation") {
      return (
        <button
          className="button button-primary"
          type="button"
          disabled={savingStepKey === step.step_key}
          onClick={() => completeStep(step.step_key)}
        >
          {savingStepKey === step.step_key
            ? "Saving..."
            : "Complete Final Confirmation"}
        </button>
      );
    }

    return undefined;
  }

  return (
    <main className="landing-page">
      <SiteHeader />

      <section className="value-strip">
        <div className="value-grid">
          <article className="value-card" style={{ gridColumn: "1 / -1" }}>
            <p className="value-card__eyebrow">Onboarding Session</p>
            <h2 className="value-card__title">Welcome to onboarding</h2>

            <p className="value-card__body">
              Your onboarding session has been created successfully. This page
              now walks the candidate through a real onboarding flow to completion.
            </p>

            <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
              <div className="hero-stat">
                <span className="hero-stat__label">Session ID</span>
                <strong style={{ wordBreak: "break-word" }}>
                  {sessionId || "Missing session"}
                </strong>
              </div>

              <div className="hero-stat">
                <span className="hero-stat__label">Overall progress</span>
                <strong>{progress}% complete</strong>
              </div>

              {sessionComplete ? (
                <div className="hero-stat">
                  <span className="hero-stat__label">Session status</span>
                  <strong>Completed</strong>
                </div>
              ) : null}
            </div>

            <div style={{ marginTop: 18 }}>
              <div
                style={{
                  width: "100%",
                  height: 14,
                  borderRadius: 999,
                  background: "#eef2f7",
                  overflow: "hidden",
                  border: "1px solid #d6dfeb",
                }}
              >
                <div
                  style={{
                    width: `${progress}%`,
                    height: "100%",
                    background: "#4a78ff",
                    borderRadius: 999,
                  }}
                />
              </div>
            </div>

            {error ? (
              <p style={{ marginTop: 14, color: "#c62828" }}>{error}</p>
            ) : null}
          </article>

          {loading ? (
            <article className="value-card" style={{ gridColumn: "1 / -1" }}>
              <p className="value-card__body">Loading onboarding steps...</p>
            </article>
          ) : cards.length === 0 ? (
            <article className="value-card" style={{ gridColumn: "1 / -1" }}>
              <p className="value-card__body">No onboarding steps found.</p>
            </article>
          ) : (
            cards.map((step) => (
              <StepCard
                key={step.step_key}
                eyebrow={`Step ${step.step_order}`}
                title={step.label}
                body={bodyForStep(step.step_key)}
                state={step.state}
                action={actionForStep(step)}
              />
            ))
          )}
        </div>
      </section>
    </main>
  );
}