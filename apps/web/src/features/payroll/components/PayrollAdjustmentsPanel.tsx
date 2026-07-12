"use client";

import { useEffect, useMemo, useState } from "react";
import type { RosterRow } from "@/features/people/types/roster.types";
import { money } from "@/features/payroll/lib/payroll.format";

type PayrollAdjustmentRow = {
  adjustment_event_id: string;
  adjustment_key: string;
  adjustment_label: string;
  adjustment_scope: "GLOBAL" | "TARGETED";
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
  onChanged: () => void;
};

function addDays(dateIso: string, days: number) {
  const date = new Date(`${dateIso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export default function PayrollAdjustmentsPanel({ slug, weekEnd, roster, onChanged }: Props) {
  const weekStart = useMemo(() => addDays(weekEnd, -6), [weekEnd]);
  const [adjustments, setAdjustments] = useState<PayrollAdjustmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [scope, setScope] = useState<"GLOBAL" | "TARGETED">("GLOBAL");
  const [label, setLabel] = useState("Holiday Pay");
  const [startDate, setStartDate] = useState(weekStart);
  const [endDate, setEndDate] = useState(weekStart);
  const [amount, setAmount] = useState("0");
  const [selectedRosterIds, setSelectedRosterIds] = useState<string[]>([]);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    setStartDate(weekStart);
    setEndDate(weekStart);
  }, [weekStart]);

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

  async function createAdjustment() {
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/company/${slug}/payroll/adjustments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          adjustment_key: "HOLIDAY_PAY",
          adjustment_label: label,
          adjustment_scope: scope,
          start_date: startDate,
          end_date: endDate,
          amount: Number(amount || 0),
          amount_mode: "DAILY",
          notes,
          roster_member_ids: scope === "TARGETED" ? selectedRosterIds : [],
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.detail ?? data?.error ?? "Failed to create adjustment.");
        return;
      }

      setAmount("0");
      setNotes("");
      setSelectedRosterIds([]);
      onChanged();
      window.location.reload();
    } finally {
      setSaving(false);
    }
  }

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

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <article className="app-card" style={{ padding: 14 }}>
        <p className="value-card__eyebrow">Payroll workbench</p>
        <h3 className="app-card__title" style={{ fontSize: 18 }}>Add payroll adjustment</h3>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10, marginTop: 12 }}>
          <label style={{ display: "grid", gap: 5 }}>
            <span className="hero-stat__label">Label</span>
            <input value={label} onChange={(e) => setLabel(e.target.value)} style={{ height: 40, borderRadius: 10, border: "1px solid #d6dfeb", padding: "0 10px" }} />
          </label>

          <label style={{ display: "grid", gap: 5 }}>
            <span className="hero-stat__label">Scope</span>
            <select
              value={scope}
              onChange={(e) => {
                const nextScope = e.target.value as "GLOBAL" | "TARGETED";
                setScope(nextScope);

                if (nextScope === "GLOBAL") {
                  setSelectedRosterIds([]);
                }
              }}
              style={{ height: 40, borderRadius: 10, border: "1px solid #d6dfeb", padding: "0 10px" }}
            >
              <option value="GLOBAL">Global</option>
              <option value="TARGETED">Targeted</option>
            </select>
          </label>

          <label style={{ display: "grid", gap: 5 }}>
            <span className="hero-stat__label">Start</span>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ height: 40, borderRadius: 10, border: "1px solid #d6dfeb", padding: "0 10px" }} />
          </label>

          <label style={{ display: "grid", gap: 5 }}>
            <span className="hero-stat__label">End</span>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ height: 40, borderRadius: 10, border: "1px solid #d6dfeb", padding: "0 10px" }} />
          </label>

          <label style={{ display: "grid", gap: 5 }}>
            <span className="hero-stat__label">Daily amount</span>
            <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ height: 40, borderRadius: 10, border: "1px solid #d6dfeb", padding: "0 10px" }} />
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

        {error ? <p style={{ color: "#991b1b", fontWeight: 800 }}>{error}</p> : null}

        <div className="cta-row" style={{ marginTop: 12 }}>
          <button className="button button-primary" type="button" disabled={saving} onClick={createAdjustment}>
            {saving ? "Saving..." : "Create adjustment"}
          </button>
        </div>
      </article>

      <article className="app-card" style={{ padding: 14 }}>
        <p className="value-card__eyebrow">Current week</p>
        <h3 className="app-card__title" style={{ fontSize: 18 }}>Adjustments</h3>

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
                </tr>
              </thead>
              <tbody>
                {adjustments.map((row) => (
                  <tr key={row.adjustment_event_id} style={{ borderBottom: "1px solid #eef2f7" }}>
                    <td style={{ padding: 10 }}><strong>{row.adjustment_label}</strong></td>
                    <td style={{ padding: 10 }}>{row.adjustment_scope}{row.adjustment_scope === "TARGETED" ? ` · ${row.target_count}` : ""}</td>
                    <td style={{ padding: 10 }}>{row.start_date} → {row.end_date}</td>
                    <td style={{ padding: 10, textAlign: "right" }}>{money(Number(row.amount ?? 0))}</td>
                    <td style={{ padding: 10, color: "#64748b" }}>{row.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>
    </section>
  );
}
