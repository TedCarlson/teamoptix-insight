"use client";

import { useEffect, useMemo, useState } from "react";
import type { RosterRow } from "@/features/people/types/roster.types";
import { money } from "@/features/payroll/lib/payroll.format";
import { buildPayrollAdjustmentCandidates } from "@/features/payroll/lib/payroll.adjustment-candidates";

type AdjustmentScope = "GLOBAL" | "TARGETED";

type PayrollAdjustmentRow = {
  adjustment_event_id: string;
  adjustment_key: string;
  adjustment_label: string;
  adjustment_scope: AdjustmentScope;
  start_date: string;
  end_date: string;
  amount: number;
  amount_mode: "FLAT" | "DAILY";
  notes: string | null;
  target_count: number;
};

type Props = {
  slug: string;
  weekEnd: string;
  roster: RosterRow[];
  payrollActivityRosterIds: string[];
};

type ReviewPayload = {
  label: string;
  scope: AdjustmentScope;
  startDate: string;
  endDate: string;
  amount: number;
  notes: string;
  selectedRoster: RosterRow[];
};

type ReversalPayload = {
  row: PayrollAdjustmentRow;
  reason: string;
};

function addDays(dateIso: string, days: number) {
  const date = new Date(`${dateIso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysAffected(startDate: string, endDate: string) {
  if (!startDate || !endDate || startDate > endDate) return 0;

  const start = new Date(`${startDate}T00:00:00Z`).getTime();
  const end = new Date(`${endDate}T00:00:00Z`).getTime();

  return Math.floor((end - start) / 86_400_000) + 1;
}

export default function PayrollAdjustmentsPanel({
  slug,
  weekEnd,
  roster,
  payrollActivityRosterIds,
}: Props) {
  const weekStart = useMemo(() => addDays(weekEnd, -6), [weekEnd]);
  const [adjustments, setAdjustments] = useState<PayrollAdjustmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [review, setReview] = useState<ReviewPayload | null>(null);
  const [reversal, setReversal] = useState<ReversalPayload | null>(null);
  const [reversalReason, setReversalReason] = useState("");

  const [scope, setScope] = useState<"" | AdjustmentScope>("");
  const [label, setLabel] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [amount, setAmount] = useState("");
  const [selectedRosterIds, setSelectedRosterIds] = useState<string[]>([]);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    setScope("");
    setLabel("");
    setStartDate("");
    setEndDate("");
    setAmount("");
    setSelectedRosterIds([]);
    setNotes("");
    setReview(null);
    setReversal(null);
    setReversalReason("");
    setNotice(null);
  }, [weekEnd]);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/company/${slug}/payroll/adjustments?weekEnd=${weekEnd}`, {
          credentials: "include",
          cache: "no-store",
        });

        const data = await res.json().catch(() => ({}));

        if (!active) return;

        if (!res.ok) {
          setError(data?.error ?? "Failed to load adjustments.");
          setAdjustments([]);
          return;
        }

        setAdjustments(Array.isArray(data?.adjustments) ? data.adjustments : []);
      } catch {
        if (!active) return;
        setError("Failed to load adjustments.");
        setAdjustments([]);
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [slug, weekEnd]);

  const adjustmentCandidates = useMemo(
    () =>
      buildPayrollAdjustmentCandidates(roster, payrollActivityRosterIds),
    [payrollActivityRosterIds, roster]
  );

  const selectedRoster = adjustmentCandidates.filter((person) =>
    selectedRosterIds.includes(person.roster_member_id)
  );

  const selectedCountLabel =
    selectedRosterIds.length === 1
      ? "1 person selected"
      : `${selectedRosterIds.length} people selected`;

  const amountNumber = Number(amount || 0);
  const canReview =
    Boolean(label.trim()) &&
    Boolean(scope) &&
    Boolean(startDate) &&
    Boolean(endDate) &&
    startDate <= endDate &&
    amount !== "" &&
    Number.isFinite(amountNumber) &&
    (scope !== "TARGETED" || selectedRosterIds.length > 0);

  function toggleRosterSelection(rosterMemberId: string, checked: boolean) {
    setSelectedRosterIds((current) => {
      const selected = new Set(current);

      if (checked) {
        selected.add(rosterMemberId);
      } else {
        selected.delete(rosterMemberId);
      }

      return Array.from(selected);
    });
  }

  function openReview() {
    if (!canReview || !scope) return;

    setReview({
      label: label.trim(),
      scope,
      startDate,
      endDate,
      amount: amountNumber,
      notes: notes.trim(),
      selectedRoster,
    });
  }

  function hasExistingReversal(row: PayrollAdjustmentRow) {
    const needle = `Reversal of adjustment ${row.adjustment_event_id}`;

    return adjustments.some((adjustment) =>
      String(adjustment.notes ?? "").includes(needle)
    );
  }

  function openReversal(row: PayrollAdjustmentRow) {
    setError(null);
    setNotice(null);
    setReversalReason("");
    setReversal({ row, reason: "" });
  }

  async function reverseAdjustment(payload: ReversalPayload) {
    const reason = payload.reason.trim();

    if (!reason) {
      setError("A reversal reason is required.");
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const res = await fetch(`/api/company/${slug}/payroll/adjustments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "reverse",
          adjustment_event_id: payload.row.adjustment_event_id,
          reason,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.detail ?? data?.error ?? "Failed to create reversal.");
        return;
      }

      setReversal(null);
      setReversalReason("");
      setNotice(
        data?.message ??
          "Reversal saved. Rebuild payroll to apply it to the selected week."
      );
      setAdjustments((current) => [
        ...current,
        {
          adjustment_event_id:
            String(data?.result?.adjustment_event_id ?? "") ||
            `pending-reversal-${payload.row.adjustment_event_id}`,
          adjustment_key: "REVERSAL",
          adjustment_label: `Reversal: ${payload.row.adjustment_label}`,
          adjustment_scope: payload.row.adjustment_scope,
          start_date: payload.row.start_date,
          end_date: payload.row.end_date,
          amount: Number(payload.row.amount ?? 0) * -1,
          amount_mode: payload.row.amount_mode,
          notes: `Reversal of adjustment ${payload.row.adjustment_event_id}: ${reason}`,
          target_count: payload.row.target_count,
        },
      ]);
    } finally {
      setSaving(false);
    }
  }

  async function createAdjustment(payload: ReviewPayload) {
    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const res = await fetch(`/api/company/${slug}/payroll/adjustments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          adjustment_key: "PAYROLL_ADJUSTMENT",
          adjustment_label: payload.label,
          adjustment_scope: payload.scope,
          start_date: payload.startDate,
          end_date: payload.endDate,
          amount: payload.amount,
          amount_mode: "DAILY",
          notes: payload.notes,
          roster_member_ids:
            payload.scope === "TARGETED"
              ? payload.selectedRoster.map((person) => person.roster_member_id)
              : [],
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.detail ?? data?.error ?? "Failed to create adjustment.");
        return;
      }

      setScope("");
      setLabel("");
      setStartDate("");
      setEndDate("");
      setAmount("");
      setNotes("");
      setSelectedRosterIds([]);
      setReview(null);
      setNotice(
        data?.message ??
          "Adjustment saved. Rebuild payroll to apply it to the selected week."
      );
      setAdjustments((current) => [
        ...current,
        {
          adjustment_event_id:
            String(data?.result?.adjustment_event_id ?? "") ||
            `pending-adjustment-${Date.now()}`,
          adjustment_key: "PAYROLL_ADJUSTMENT",
          adjustment_label: payload.label,
          adjustment_scope: payload.scope,
          start_date: payload.startDate,
          end_date: payload.endDate,
          amount: payload.amount,
          amount_mode: "DAILY",
          notes: payload.notes || null,
          target_count:
            payload.scope === "TARGETED" ? payload.selectedRoster.length : 0,
        },
      ]);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="payroll-adjustment-panel">
      <article className="payroll-adjustment-editor">
        <header className="payroll-adjustment-editor__header">
          <div>
            <p className="value-card__eyebrow">Pay adjustment</p>
            <h3>Create a payroll adjustment</h3>
          </div>
          <span className="payroll-adjustment-editor__signal payroll-adjustment-editor__signal--staged">
            Staged until rebuild
          </span>
        </header>

        <p className="payroll-adjustment-editor__intro">
          Define who is affected, the effective dates, and the daily amount.
          You will review the complete impact before anything is saved.
        </p>

        <div className="payroll-adjustment-form">
          <label className="payroll-adjustment-field payroll-adjustment-field--third">
            <span>Label</span>
            <input
              value={label}
              placeholder="Example: Peak bonus"
              onChange={(event) => setLabel(event.target.value)}
            />
          </label>

          <label className="payroll-adjustment-field payroll-adjustment-field--third">
            <span>Scope</span>
            <select
              value={scope}
              onChange={(event) => {
                const nextScope = event.target.value as "" | AdjustmentScope;
                setScope(nextScope);

                if (nextScope !== "TARGETED") {
                  setSelectedRosterIds([]);
                }
              }}
            >
              <option value="">Select scope</option>
              <option value="GLOBAL">Everyone eligible</option>
              <option value="TARGETED">Selected people</option>
            </select>
          </label>

          <label className="payroll-adjustment-field payroll-adjustment-field--third">
            <span>Daily amount</span>
            <input
              type="number"
              step="0.01"
              value={amount}
              placeholder="0.00"
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>

          <label className="payroll-adjustment-field payroll-adjustment-field--half">
            <span>Start date</span>
            <input
              type="date"
              value={startDate}
              onChange={(event) => {
                const nextStart = event.target.value;
                setStartDate(nextStart);

                if (!endDate) {
                  setEndDate(nextStart);
                }
              }}
            />
          </label>

          <label className="payroll-adjustment-field payroll-adjustment-field--half">
            <span>End date</span>
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </label>

          {scope === "TARGETED" ? (
            <details className="payroll-adjustment-targets">
              <summary>
                <span>
                  <strong>Choose people</strong>
                  <small>{selectedCountLabel}</small>
                </span>
                <span aria-hidden="true">＋</span>
              </summary>

              {selectedRoster.length > 0 ? (
                <div className="payroll-adjustment-targets__chips">
                  {selectedRoster.map((person) => (
                    <span key={person.roster_member_id}>
                      {person.full_name || "Unnamed driver"}
                    </span>
                  ))}
                </div>
              ) : null}

              <div
                className="payroll-adjustment-targets__list"
                aria-label="Targeted payroll adjustment people"
              >
                {adjustmentCandidates.length === 0 ? (
                  <p>No payroll-eligible people are available for this week.</p>
                ) : (
                  adjustmentCandidates.map((person) => (
                    <label key={person.roster_member_id}>
                      <input
                        type="checkbox"
                        checked={selectedRosterIds.includes(person.roster_member_id)}
                        onChange={(event) =>
                          toggleRosterSelection(
                            person.roster_member_id,
                            event.target.checked
                          )
                        }
                      />
                      <span>
                        {person.full_name || "Unnamed driver"}
                        <small>
                          {person.roster_record_kind === "WALK_ON"
                            ? "Support · Walk-on"
                            : person.employment_status}
                        </small>
                      </span>
                    </label>
                  ))
                )}
              </div>
            </details>
          ) : null}

          <label className="payroll-adjustment-field payroll-adjustment-field--wide">
            <span>Reason and supporting note</span>
            <input
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Why is this adjustment needed?"
            />
          </label>

          <div className="payroll-adjustment-form__action">
            <button
              className="button button-primary"
              type="button"
              disabled={saving || !canReview}
              onClick={openReview}
            >
              Review adjustment
            </button>
          </div>
        </div>

        {startDate && endDate && startDate > endDate ? (
          <p className="payroll-adjustment-message payroll-adjustment-message--error">
            End date must be on or after start date.
          </p>
        ) : null}

        {error ? (
          <p className="payroll-adjustment-message payroll-adjustment-message--error">{error}</p>
        ) : null}
        {notice ? (
          <p className="payroll-adjustment-message payroll-adjustment-message--success">{notice}</p>
        ) : null}
      </article>

      <article className="payroll-evidence-ledger">
        <header className="payroll-evidence-ledger__header">
          <div>
            <p className="value-card__eyebrow">Weekly evidence</p>
            <h3>Pay-adjustment ledger</h3>
          </div>
          <span>{adjustments.length} {adjustments.length === 1 ? "record" : "records"}</span>
        </header>

        {loading ? (
          <p className="payroll-evidence-ledger__empty">Loading adjustments…</p>
        ) : adjustments.length === 0 ? (
          <p className="payroll-evidence-ledger__empty">
            No pay adjustments have been recorded for {weekStart} → {weekEnd}.
          </p>
        ) : (
          <div className="payroll-evidence-ledger__table-wrap">
            <table className="payroll-evidence-ledger__table">
              <thead>
                <tr>
                  <th>Adjustment</th>
                  <th>Scope</th>
                  <th>Effective dates</th>
                  <th>Daily amount</th>
                  <th>Evidence</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {adjustments.map((row) => {
                  const alreadyReversed = hasExistingReversal(row);

                  return (
                    <tr key={row.adjustment_event_id}>
                      <td><strong>{row.adjustment_label}</strong></td>
                      <td>
                        <span className="payroll-evidence-chip">
                          {row.adjustment_scope === "TARGETED"
                            ? `${row.target_count} selected`
                            : "Everyone"}
                        </span>
                      </td>
                      <td>{row.start_date} → {row.end_date}</td>
                      <td><strong>{money(Number(row.amount ?? 0))}</strong></td>
                      <td>{row.notes || "—"}</td>
                      <td>
                        {alreadyReversed ? (
                          <span className="payroll-ledger-status payroll-ledger-status--reversed">
                            Reversed
                          </span>
                        ) : (
                          <button
                            className="payroll-ledger-status payroll-ledger-status--staged"
                            type="button"
                            disabled={saving}
                            onClick={() => openReversal(row)}
                          >
                            Staged · Reverse
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </article>

      {reversal ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(15,23,42,.42)",
            display: "grid",
            placeItems: "center",
            padding: 24,
          }}
          onClick={() => setReversal(null)}
        >
          <div
            className="app-card"
            style={{ width: "min(620px, 96vw)", padding: 18 }}
            onClick={(event) => event.stopPropagation()}
          >
            <p className="value-card__eyebrow">Reverse payroll adjustment</p>
            <h3 className="app-card__title" style={{ fontSize: 20 }}>Create offsetting row</h3>
            <p className="muted" style={{ marginTop: 6 }}>
              This keeps the original adjustment and creates a new row with the opposite amount. It will not rebuild payroll until you run Rebuild.
            </p>

            <dl style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: "8px 12px", marginTop: 14, fontSize: 14 }}>
              <dt style={{ fontWeight: 850, color: "#64748b" }}>Original</dt>
              <dd style={{ margin: 0 }}>{reversal.row.adjustment_label}</dd>
              <dt style={{ fontWeight: 850, color: "#64748b" }}>Scope</dt>
              <dd style={{ margin: 0 }}>{reversal.row.adjustment_scope}{reversal.row.adjustment_scope === "TARGETED" ? ` · ${reversal.row.target_count}` : ""}</dd>
              <dt style={{ fontWeight: 850, color: "#64748b" }}>Dates</dt>
              <dd style={{ margin: 0 }}>{reversal.row.start_date} → {reversal.row.end_date}</dd>
              <dt style={{ fontWeight: 850, color: "#64748b" }}>Original amount</dt>
              <dd style={{ margin: 0 }}>{money(Number(reversal.row.amount ?? 0))}</dd>
              <dt style={{ fontWeight: 850, color: "#64748b" }}>Reversal amount</dt>
              <dd style={{ margin: 0 }}>{money(Number(reversal.row.amount ?? 0) * -1)}</dd>
              <dt style={{ fontWeight: 850, color: "#64748b" }}>Original notes</dt>
              <dd style={{ margin: 0 }}>{reversal.row.notes || "—"}</dd>
            </dl>

            <label style={{ display: "grid", gap: 6, marginTop: 14 }}>
              <span className="hero-stat__label">Reason</span>
              <textarea
                value={reversalReason}
                onChange={(event) => {
                  setReversalReason(event.target.value);
                  setReversal((current) => current ? { ...current, reason: event.target.value } : current);
                }}
                rows={3}
                placeholder="Required reversal reason"
                style={{ borderRadius: 10, border: "1px solid #d6dfeb", padding: 10 }}
              />
            </label>

            <div className="cta-row" style={{ marginTop: 18 }}>
              <button className="button" type="button" disabled={saving} onClick={() => setReversal(null)}>
                Cancel
              </button>
              <button
                className="button button-primary"
                type="button"
                disabled={saving || !reversalReason.trim()}
                onClick={() => reverseAdjustment({ ...reversal, reason: reversalReason })}
              >
                {saving ? "Saving..." : "Accept and create reversal"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {review ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(15,23,42,.42)",
            display: "grid",
            placeItems: "center",
            padding: 24,
          }}
          onClick={() => setReview(null)}
        >
          <div
            className="app-card"
            style={{ width: "min(640px, 96vw)", padding: 18 }}
            onClick={(event) => event.stopPropagation()}
          >
            <p className="value-card__eyebrow">Review payroll adjustment</p>
            <h3 className="app-card__title" style={{ fontSize: 20 }}>Accept before creating</h3>
            <p className="muted" style={{ marginTop: 6 }}>
              This will add an adjustment row to payroll review. It will not rebuild payroll until you run Rebuild.
            </p>

            <dl style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: "8px 12px", marginTop: 14, fontSize: 14 }}>
              <dt style={{ fontWeight: 850, color: "#64748b" }}>Label</dt>
              <dd style={{ margin: 0 }}>{review.label}</dd>
              <dt style={{ fontWeight: 850, color: "#64748b" }}>Scope</dt>
              <dd style={{ margin: 0 }}>{review.scope}</dd>
              <dt style={{ fontWeight: 850, color: "#64748b" }}>Dates</dt>
              <dd style={{ margin: 0 }}>{review.startDate} → {review.endDate}</dd>
              <dt style={{ fontWeight: 850, color: "#64748b" }}>Days affected</dt>
              <dd style={{ margin: 0 }}>{daysAffected(review.startDate, review.endDate)}</dd>
              <dt style={{ fontWeight: 850, color: "#64748b" }}>Daily amount</dt>
              <dd style={{ margin: 0 }}>{money(review.amount)}</dd>
              <dt style={{ fontWeight: 850, color: "#64748b" }}>Targets</dt>
              <dd style={{ margin: 0 }}>
                {review.scope === "GLOBAL"
                  ? "All eligible payroll rows in range"
                  : review.selectedRoster.map((person) => person.full_name || "Unnamed driver").join(", ")}
              </dd>
              <dt style={{ fontWeight: 850, color: "#64748b" }}>Notes</dt>
              <dd style={{ margin: 0 }}>{review.notes || "—"}</dd>
            </dl>

            <div className="cta-row" style={{ marginTop: 18 }}>
              <button className="button" type="button" disabled={saving} onClick={() => setReview(null)}>
                Back to edit
              </button>
              <button className="button button-primary" type="button" disabled={saving} onClick={() => createAdjustment(review)}>
                {saving ? "Saving..." : "Accept and create adjustment"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
