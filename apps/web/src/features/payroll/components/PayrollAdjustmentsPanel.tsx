"use client";

import { useEffect, useMemo, useState } from "react";
import type { RosterRow } from "@/features/people/types/roster.types";
import { money } from "@/features/payroll/lib/payroll.format";

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

export default function PayrollAdjustmentsPanel({ slug, weekEnd, roster }: Props) {
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

  const activeRoster = roster
    .filter((row) => row.employment_status === "Active" || row.employment_status === "Trainee")
    .sort((a, b) => String(a.full_name ?? "").localeCompare(String(b.full_name ?? "")));

  const selectedRoster = activeRoster.filter((person) =>
    selectedRosterIds.includes(person.roster_member_id)
  );

  const selectedCountLabel =
    selectedRosterIds.length === 1
      ? "1 driver selected"
      : `${selectedRosterIds.length} drivers selected`;

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
    <section style={{ display: "grid", gap: 12 }}>
      <article className="app-card" style={{ padding: 14 }}>
        <p className="value-card__eyebrow">Payroll workbench</p>
        <h3 className="app-card__title" style={{ fontSize: 18 }}>Add payroll adjustment</h3>
        <p className="muted" style={{ marginTop: 6 }}>
          Select the label, scope, start date, and end date before creating an adjustment.
          No payroll adjustment is inserted until the review step is accepted.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10, marginTop: 12 }}>
          <label style={{ display: "grid", gap: 5 }}>
            <span className="hero-stat__label">Label</span>
            <input
              value={label}
              placeholder="Required"
              onChange={(e) => setLabel(e.target.value)}
              style={{ height: 40, borderRadius: 10, border: "1px solid #d6dfeb", padding: "0 10px" }}
            />
          </label>

          <label style={{ display: "grid", gap: 5 }}>
            <span className="hero-stat__label">Scope</span>
            <select
              value={scope}
              onChange={(e) => {
                const nextScope = e.target.value as "" | AdjustmentScope;
                setScope(nextScope);

                if (nextScope !== "TARGETED") {
                  setSelectedRosterIds([]);
                }
              }}
              style={{ height: 40, borderRadius: 10, border: "1px solid #d6dfeb", padding: "0 10px" }}
            >
              <option value="">Select scope</option>
              <option value="GLOBAL">Global</option>
              <option value="TARGETED">Targeted</option>
            </select>
          </label>

          <label style={{ display: "grid", gap: 5 }}>
            <span className="hero-stat__label">Start</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                const nextStart = e.target.value;
                setStartDate(nextStart);

                if (!endDate) {
                  setEndDate(nextStart);
                }
              }}
              style={{ height: 40, borderRadius: 10, border: "1px solid #d6dfeb", padding: "0 10px" }}
            />
          </label>

          <label style={{ display: "grid", gap: 5 }}>
            <span className="hero-stat__label">End</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{ height: 40, borderRadius: 10, border: "1px solid #d6dfeb", padding: "0 10px" }}
            />
          </label>

          <label style={{ display: "grid", gap: 5 }}>
            <span className="hero-stat__label">Daily amount</span>
            <input
              type="number"
              step="0.01"
              value={amount}
              placeholder="Required"
              onChange={(e) => setAmount(e.target.value)}
              style={{ height: 40, borderRadius: 10, border: "1px solid #d6dfeb", padding: "0 10px" }}
            />
          </label>

          {scope === "TARGETED" ? (
            <section className="payroll-target-picker" style={{ gridColumn: "span 3" }}>
              <div className="payroll-target-picker__summary">
                <div>
                  <span className="hero-stat__label">Targets</span>
                  <strong>{selectedCountLabel}</strong>
                </div>

                {selectedRoster.length > 0 ? (
                  <details>
                    <summary>Review selected drivers</summary>
                    <div className="payroll-target-picker__chips">
                      {selectedRoster.map((person) => (
                        <span key={person.roster_member_id}>
                          {person.full_name || "Unnamed driver"}
                        </span>
                      ))}
                    </div>
                  </details>
                ) : (
                  <p>Select one or more eligible drivers below.</p>
                )}
              </div>

              <div className="payroll-target-picker__list" aria-label="Targeted payroll adjustment drivers">
                {activeRoster.length === 0 ? (
                  <p>No active drivers are available for targeted adjustments.</p>
                ) : (
                  activeRoster.map((person) => (
                    <label className="payroll-target-picker__option" key={person.roster_member_id}>
                      <input
                        type="checkbox"
                        checked={selectedRosterIds.includes(person.roster_member_id)}
                        onChange={(event) =>
                          toggleRosterSelection(person.roster_member_id, event.target.checked)
                        }
                      />
                      <span>
                        {person.full_name || "Unnamed driver"} · {person.employment_status}
                      </span>
                    </label>
                  ))
                )}
              </div>
            </section>
          ) : null}

          <label style={{ display: "grid", gap: 5, gridColumn: "1 / -1" }}>
            <span className="hero-stat__label">Notes</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} style={{ borderRadius: 10, border: "1px solid #d6dfeb", padding: 10 }} />
          </label>
        </div>

        {startDate && endDate && startDate > endDate ? (
          <p style={{ color: "#991b1b", fontWeight: 800 }}>End date must be on or after start date.</p>
        ) : null}

        {error ? <p style={{ color: "#991b1b", fontWeight: 800 }}>{error}</p> : null}
        {notice ? <p style={{ color: "#166534", fontWeight: 800 }}>{notice}</p> : null}

        <div className="cta-row" style={{ marginTop: 12 }}>
          <button className="button button-primary" type="button" disabled={saving || !canReview} onClick={openReview}>
            Review adjustment
          </button>
        </div>
      </article>

      <article className="app-card" style={{ padding: 14 }}>
        <p className="value-card__eyebrow">Current week</p>
        <h3 className="app-card__title" style={{ fontSize: 18 }}>Adjustments</h3>
        <p className="muted" style={{ marginTop: 6 }}>Selected payroll week: {weekStart} → {weekEnd}</p>

        {loading ? (
          <p className="muted">Loading adjustments...</p>
        ) : adjustments.length === 0 ? (
          <p className="app-card__body" style={{ marginTop: 8 }}>No payroll adjustments for this week.</p>
        ) : (
          <div style={{ marginTop: 12, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #d6dfeb", color: "#64748b", textAlign: "left" }}>
                  <th style={{ padding: 10 }}>Adjustment</th>
                  <th style={{ padding: 10 }}>Scope</th>
                  <th style={{ padding: 10 }}>Dates</th>
                  <th style={{ padding: 10, textAlign: "right" }}>Amount</th>
                  <th style={{ padding: 10 }}>Notes</th>
                  <th style={{ padding: 10, textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {adjustments.map((row) => {
                  const alreadyReversed = hasExistingReversal(row);

                  return (
                    <tr key={row.adjustment_event_id} style={{ borderBottom: "1px solid #eef2f7" }}>
                      <td style={{ padding: 10 }}><strong>{row.adjustment_label}</strong></td>
                      <td style={{ padding: 10 }}>{row.adjustment_scope}{row.adjustment_scope === "TARGETED" ? ` · ${row.target_count}` : ""}</td>
                      <td style={{ padding: 10 }}>{row.start_date} → {row.end_date}</td>
                      <td style={{ padding: 10, textAlign: "right" }}>{money(Number(row.amount ?? 0))}</td>
                      <td style={{ padding: 10, color: "#64748b" }}>
                        {row.notes || "—"}
                        {alreadyReversed ? (
                          <div style={{ color: "#166534", fontWeight: 850, marginTop: 4 }}>Reversed</div>
                        ) : null}
                      </td>
                      <td style={{ padding: 10, textAlign: "right" }}>
                        <button
                          className="button"
                          type="button"
                          disabled={saving || alreadyReversed}
                          onClick={() => openReversal(row)}
                          style={{ minHeight: 34, padding: "6px 12px" }}
                        >
                          Reverse
                        </button>
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
