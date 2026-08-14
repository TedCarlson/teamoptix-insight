"use client";

import { useEffect, useState } from "react";
import type { RosterRow } from "@/features/people/types/roster.types";

type Props = {
  open: boolean;
  slug: string;
  person: RosterRow | null;
  effectiveDate: string;
  saving?: boolean;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
};

export default function TraineePayOverrideOverlay({
  open,
  slug,
  person,
  effectiveDate,
  saving = false,
  onClose,
  onSaved,
}: Props) {
  const [rate, setRate] = useState("");
  const [startDate, setStartDate] = useState(effectiveDate);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setRate(person?.daily_pay_rate == null ? "" : String(person.daily_pay_rate));
    setStartDate(effectiveDate);
    setError(null);
  }, [open, person?.daily_pay_rate, effectiveDate]);

  if (!open || !person) return null;

  async function save() {
    if (!person) return;
    const activePerson = person;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/company/${slug}/people/roster/${activePerson.roster_member_id}/trainee-pay`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            trainee_daily_pay_rate: rate,
            effective_start: startDate,
          }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error ?? "Failed to save trainee pay.");
        return;
      }

      await onSaved();
      onClose();
    } catch {
      setError("Failed to save trainee pay.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="people-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 120,
        background: "rgba(15,23,42,.34)",
        display: "grid",
        placeItems: "center",
        padding: 16,
      }}
    >
      <aside
        className="people-dialog-surface"
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
        style={{
          width: "min(460px, 100%)",
          borderRadius: 22,
          border: "1px solid #d6dfeb",
          background: "#fff",
          boxShadow: "0 24px 70px rgba(15,23,42,.22)",
          padding: 18,
          display: "grid",
          gap: 14,
        }}
      >
        <header>
          <p className="workspace-eyebrow">Trainee pay override</p>
          <h2 style={{ margin: 0, fontSize: 20 }}>{person.full_name}</h2>
          <p className="workspace-card-body" style={{ marginTop: 4 }}>
            This temporary rate applies while the person remains in Trainee status.
          </p>
        </header>

        <label style={{ display: "grid", gap: 6 }}>
          <span className="hero-stat__label">Effective start</span>
          <input
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            style={{
              minHeight: 42,
              borderRadius: 12,
              border: "1px solid #d6dfeb",
              padding: "0 12px",
              fontWeight: 800,
            }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span className="hero-stat__label">Trainee daily pay</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={rate}
            onChange={(event) => setRate(event.target.value)}
            style={{
              minHeight: 42,
              borderRadius: 12,
              border: "1px solid #d6dfeb",
              padding: "0 12px",
              fontWeight: 800,
            }}
          />
        </label>

        <p className="workspace-card-body" style={{ margin: 0 }}>
          Defaults to the baseline daily pay on the person record. Edit only when training pay should differ.
        </p>

        {error ? <p style={{ margin: 0, color: "#c62828", fontWeight: 800 }}>{error}</p> : null}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button className="button" type="button" disabled={submitting || saving} onClick={onClose}>
            Cancel
          </button>
          <button className="button button-primary" type="button" disabled={submitting || saving} onClick={save}>
            {submitting ? "Saving..." : "Save trainee pay"}
          </button>
        </div>
      </aside>
    </div>
  );
}
