"use client";

import { useEffect, useState } from "react";
import type { RosterRow } from "@/features/people/types/roster.types";
import styles from "./candidate-workflow-drawer.module.css";

type PromotionTarget = "Trainee" | "Active";

type Props = {
  open: boolean;
  slug: string;
  person: RosterRow;
  onClose: () => void;
  onPromoted: (roster: RosterRow) => void | Promise<void>;
};

function todayLabel() {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date());
}

export default function CandidatePromotionOverlay({
  open,
  slug,
  person,
  onClose,
  onPromoted,
}: Props) {
  const [target, setTarget] = useState<PromotionTarget>("Trainee");
  const [traineeRate, setTraineeRate] = useState("");
  const [baselineRate, setBaselineRate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const existingBaseline = Number(person.daily_pay_rate ?? 0);
  const hasBaseline = Number.isFinite(existingBaseline) && existingBaseline > 0;

  useEffect(() => {
    if (!open) return;
    setTarget("Trainee");
    setTraineeRate(
      person.trainee_daily_pay_rate == null
        ? ""
        : String(person.trainee_daily_pay_rate),
    );
    setBaselineRate(hasBaseline ? String(existingBaseline) : "");
    setError(null);
  }, [open, person.roster_member_id, person.trainee_daily_pay_rate, hasBaseline, existingBaseline]);

  if (!open) return null;

  const requiredRate = target === "Trainee" ? traineeRate : baselineRate;
  const rateIsValid = Number(requiredRate) > 0;
  const canSubmit = target === "Active" && hasBaseline ? true : rateIsValid;

  async function promote() {
    if (!canSubmit) {
      setError(
        target === "Trainee"
          ? "Enter the trainee daily pay rate."
          : "Set the baseline daily rate before activation.",
      );
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/company/${slug}/hiring/candidates/${person.roster_member_id}/promote`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            target_status: target,
            trainee_daily_pay_rate:
              target === "Trainee" ? Number(traineeRate) : null,
            baseline_daily_pay_rate:
              target === "Active" && !hasBaseline
                ? Number(baselineRate)
                : null,
          }),
        },
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data?.roster) {
        setError(
          data?.detail ?? data?.error ?? "Candidate promotion could not be completed.",
        );
        return;
      }

      await onPromoted(data.roster as RosterRow);
    } catch {
      setError("Candidate promotion could not be completed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="people-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 130,
        display: "grid",
        placeItems: "center",
        padding: 16,
        background: "rgba(15, 23, 42, .46)",
      }}
    >
      <aside
        className="people-dialog-surface"
        aria-label={`Promote ${person.full_name}`}
        aria-modal="true"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
        style={{
          width: "min(520px, 100%)",
          display: "grid",
          gap: 16,
          padding: 20,
          border: "1px solid #d5dfeb",
          borderRadius: 22,
          background: "#fff",
          boxShadow: "0 28px 76px rgba(15, 23, 42, .28)",
        }}
      >
        <header>
          <p className="workspace-eyebrow">Direct roster promotion</p>
          <h2 style={{ margin: "3px 0 0", fontSize: 23 }}>{person.full_name}</h2>
          <p className="workspace-card-body" style={{ margin: "6px 0 0" }}>
            Choose the operating status. Readiness records remain available for follow-up and do not block promotion.
          </p>
        </header>

        <div
          aria-label="Promotion status"
          role="group"
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
        >
          {(["Trainee", "Active"] as PromotionTarget[]).map((option) => (
            <button
              className={target === option ? "button button-primary" : "button"}
              key={option}
              onClick={() => {
                setTarget(option);
                setError(null);
              }}
              type="button"
            >
              {option}
            </button>
          ))}
        </div>

        <div
          style={{
            display: "grid",
            gap: 12,
            padding: 14,
            border: "1px solid #dce5ef",
            borderRadius: 15,
            background: "#f8fbff",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span style={{ color: "#64748b", fontSize: 12 }}>Effective date</span>
            <strong style={{ color: "#17213a", fontSize: 12 }}>Today · {todayLabel()}</strong>
          </div>

          {target === "Trainee" ? (
            <label style={{ display: "grid", gap: 6 }}>
              <span className="hero-stat__label">Trainee daily pay</span>
              <input
                autoFocus
                min="0.01"
                onChange={(event) => setTraineeRate(event.target.value)}
                placeholder="Required daily rate"
                step="0.01"
                type="number"
                value={traineeRate}
              />
            </label>
          ) : hasBaseline ? (
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <span style={{ color: "#64748b", fontSize: 12 }}>Baseline daily pay</span>
              <strong style={{ color: "#17213a", fontSize: 13 }}>
                ${existingBaseline.toFixed(2)}/day
              </strong>
            </div>
          ) : (
            <label style={{ display: "grid", gap: 6 }}>
              <span className="hero-stat__label">Baseline daily pay</span>
              <input
                autoFocus
                min="0.01"
                onChange={(event) => setBaselineRate(event.target.value)}
                placeholder="Required before activation"
                step="0.01"
                type="number"
                value={baselineRate}
              />
              <small style={{ color: "#64748b" }}>
                This becomes the roster member&apos;s operating daily rate effective today.
              </small>
            </label>
          )}
        </div>

        {error ? (
          <p style={{ margin: 0, color: "#b42318", fontSize: 12, fontWeight: 800 }}>
            {error}
          </p>
        ) : null}

        <footer style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button className="button" disabled={submitting} onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className={`button ${styles.promoteButton}`}
            disabled={submitting || !canSubmit}
            onClick={() => void promote()}
            type="button"
          >
            {submitting ? "Promoting…" : `Promote to ${target}`}
          </button>
        </footer>
      </aside>
    </div>
  );
}
