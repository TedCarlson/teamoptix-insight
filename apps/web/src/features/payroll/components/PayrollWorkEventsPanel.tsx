"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { RosterRow } from "@/features/people/types/roster.types";

type PayrollWorkEvent = {
  work_event_id: string;
  roster_member_id: string;
  person_name: string;
  worker_type: string | null;
  employment_status: string | null;
  service_date: string;
  event_type: "TRAINING_DAY" | "HELPER_DAY" | "WALK_ON_DAY";
  event_status: "ACTIVE" | "REVERSED";
  note: string;
  reversal_reason: string | null;
  created_at: string;
  pay_treatment: "ROSTER_RATE" | "ONE_DAY_RATE" | "INTERCOMPANY";
  override_daily_pay_rate: number | null;
  roster_record_kind: "INTERNAL" | "WALK_ON";
};

type Props = {
  slug: string;
  days: string[];
  roster: RosterRow[];
  onChanged: () => void;
};

function eventLabel(eventType: PayrollWorkEvent["event_type"]) {
  if (eventType === "TRAINING_DAY") return "Training day";
  if (eventType === "WALK_ON_DAY") return "Walk-on day";
  return "Helper day";
}

function treatmentLabel(event: PayrollWorkEvent) {
  if (event.event_type !== "WALK_ON_DAY") return "Roster rate";
  if (event.pay_treatment === "ONE_DAY_RATE") {
    return `$${Number(event.override_daily_pay_rate ?? 0).toFixed(2)} one-day rate`;
  }
  return "Intercompany · no employee pay";
}

export default function PayrollWorkEventsPanel({
  slug,
  days,
  roster,
  onChanged,
}: Props) {
  const [events, setEvents] = useState<PayrollWorkEvent[]>([]);
  const [rosterMemberId, setRosterMemberId] = useState("");
  const [serviceDate, setServiceDate] = useState(days[days.length - 1] ?? "");
  const [eventType, setEventType] =
    useState<PayrollWorkEvent["event_type"]>("TRAINING_DAY");
  const [payTreatment, setPayTreatment] =
    useState<PayrollWorkEvent["pay_treatment"]>("ONE_DAY_RATE");
  const [overrideDailyPayRate, setOverrideDailyPayRate] = useState("");
  const [note, setNote] = useState("");
  const [reversingId, setReversingId] = useState<string | null>(null);
  const [reversalReason, setReversalReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const eligibleRoster = useMemo(
    () =>
      roster
        .filter((person) =>
          eventType === "WALK_ON_DAY"
            ? person.roster_record_kind === "WALK_ON"
            : person.roster_record_kind !== "WALK_ON" &&
              (person.employment_status === "Active" ||
                person.employment_status === "Trainee")
        )
        .sort((a, b) => a.full_name.localeCompare(b.full_name)),
    [eventType, roster]
  );

  const loadEvents = useCallback(async () => {
    if (!slug || days.length === 0) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/company/${slug}/payroll/work-events?startDate=${days[0]}&endDate=${days[days.length - 1]}`,
        { credentials: "include", cache: "no-store" }
      );
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(payload?.error ?? "Failed to load payroll work events.");
        setEvents([]);
        return;
      }

      setEvents(Array.isArray(payload?.events) ? payload.events : []);
    } catch {
      setError("Failed to load payroll work events.");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [days, slug]);

  useEffect(() => {
    setServiceDate(days[days.length - 1] ?? "");
    setReversingId(null);
    setReversalReason("");
    setNotice(null);
    void loadEvents();
  }, [days, loadEvents]);

  async function submitCreate(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(`/api/company/${slug}/payroll/work-events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "create",
          roster_member_id: rosterMemberId,
          service_date: serviceDate,
          event_type: eventType,
          pay_treatment: eventType === "WALK_ON_DAY" ? payTreatment : null,
          override_daily_pay_rate:
            eventType === "WALK_ON_DAY" && payTreatment === "ONE_DAY_RATE"
              ? Number(overrideDailyPayRate)
              : null,
          note,
        }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(payload?.detail ?? payload?.error ?? "Failed to save work event.");
        return;
      }

      setNote("");
      setNotice(payload?.message ?? "Work event saved and payroll rebuilt.");
      onChanged();
    } catch {
      setError("Failed to save work event.");
    } finally {
      setSaving(false);
    }
  }

  async function submitReversal(workEventId: string) {
    if (!reversalReason.trim()) {
      setError("A reversal reason is required.");
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(`/api/company/${slug}/payroll/work-events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "reverse",
          work_event_id: workEventId,
          reason: reversalReason,
        }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(payload?.detail ?? payload?.error ?? "Failed to reverse work event.");
        return;
      }

      setReversingId(null);
      setReversalReason("");
      setNotice(payload?.message ?? "Work event reversed and payroll rebuilt.");
      onChanged();
    } catch {
      setError("Failed to reverse work event.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="payroll-adjustment-panel">
      <article className="payroll-adjustment-editor">
        <header className="payroll-adjustment-editor__header">
          <div>
            <p className="value-card__eyebrow">Work evidence</p>
            <h3>Add a missed or supporting work day</h3>
          </div>
          <span className="payroll-adjustment-editor__signal">
            Rebuilds when saved
          </span>
        </header>

        <p className="payroll-adjustment-editor__intro">
          Record only the evidence DSW could not resolve. Route production stays
          authoritative; this entry fills the person, pay, and audit seam.
        </p>

        <form className="payroll-adjustment-form" onSubmit={submitCreate}>
          <label className="payroll-adjustment-field payroll-adjustment-field--third">
            <span>Work type</span>
            <select
              value={eventType}
              onChange={(changeEvent) => {
                setEventType(
                  changeEvent.target.value as PayrollWorkEvent["event_type"]
                );
                setRosterMemberId("");
              }}
              required
            >
              <option value="TRAINING_DAY">Training day</option>
              <option value="HELPER_DAY">Helper day</option>
              <option value="WALK_ON_DAY">Walk-on day</option>
            </select>
          </label>

          <label className="payroll-adjustment-field payroll-adjustment-field--third">
            <span>Person</span>
            <select
              value={rosterMemberId}
              onChange={(changeEvent) => setRosterMemberId(changeEvent.target.value)}
              required
            >
              <option value="">Select person</option>
              {eligibleRoster.map((person) => (
                <option
                  key={person.roster_member_id}
                  value={person.roster_member_id}
                >
                  {person.full_name} · {person.employment_status}
                </option>
              ))}
            </select>
          </label>

          <label className="payroll-adjustment-field payroll-adjustment-field--third">
            <span>Service date</span>
            <select
              value={serviceDate}
              onChange={(changeEvent) => setServiceDate(changeEvent.target.value)}
              required
            >
              {days.map((day) => (
                <option key={day} value={day}>{day}</option>
              ))}
            </select>
          </label>

          {eventType === "WALK_ON_DAY" ? (
            <>
              <label className="payroll-adjustment-field payroll-adjustment-field--third">
                <span>Pay treatment</span>
                <select
                  value={payTreatment}
                  onChange={(changeEvent) =>
                    setPayTreatment(
                      changeEvent.target.value as PayrollWorkEvent["pay_treatment"]
                    )
                  }
                >
                  <option value="ONE_DAY_RATE">One-day rate</option>
                  <option value="INTERCOMPANY">Intercompany · no employee pay</option>
                </select>
              </label>

              {payTreatment === "ONE_DAY_RATE" ? (
                <label className="payroll-adjustment-field payroll-adjustment-field--third">
                  <span>One-day rate</span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={overrideDailyPayRate}
                    onChange={(changeEvent) =>
                      setOverrideDailyPayRate(changeEvent.target.value)
                    }
                    required
                    placeholder="0.00"
                  />
                </label>
              ) : null}
            </>
          ) : null}

          <label className="payroll-adjustment-field payroll-adjustment-field--wide">
            <span>Reason and verification</span>
            <input
              value={note}
              onChange={(changeEvent) => setNote(changeEvent.target.value)}
              required
              placeholder="What was missed, and how was it verified?"
            />
          </label>

          <div className="payroll-adjustment-form__action">
            <button
              type="submit"
              className="button button-primary"
              disabled={saving}
            >
              {saving ? "Saving…" : "Add evidence"}
            </button>
          </div>
        </form>

        {eventType === "WALK_ON_DAY" && eligibleRoster.length === 0 ? (
          <p className="payroll-adjustment-message payroll-adjustment-message--attention">
            No support drivers are available. Add the person to the walk-on roster
            before creating payroll evidence.
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="payroll-adjustment-message payroll-adjustment-message--error">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p role="status" className="payroll-adjustment-message payroll-adjustment-message--success">
            {notice}
          </p>
        ) : null}
      </article>

      <article className="payroll-evidence-ledger">
        <header className="payroll-evidence-ledger__header">
          <div>
            <p className="value-card__eyebrow">Weekly evidence</p>
            <h3>Work-event ledger</h3>
          </div>
          <span>{events.length} {events.length === 1 ? "record" : "records"}</span>
        </header>

        {loading ? (
          <p className="payroll-evidence-ledger__empty">Loading work evidence…</p>
        ) : events.length === 0 ? (
          <p className="payroll-evidence-ledger__empty">
            No fallback work evidence has been recorded for this week.
          </p>
        ) : (
          <div className="payroll-evidence-ledger__table-wrap">
            <table className="payroll-evidence-ledger__table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Person</th>
                  <th>Evidence</th>
                  <th>Verification</th>
                  <th>Pay treatment</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {events.map((workEvent) => (
                  <tr key={workEvent.work_event_id}>
                    <td>{workEvent.service_date}</td>
                    <td><strong>{workEvent.person_name}</strong></td>
                    <td>
                      <span className="payroll-evidence-chip">
                        {eventLabel(workEvent.event_type)}
                      </span>
                    </td>
                    <td>
                      {workEvent.note || "—"}
                      {workEvent.reversal_reason ? (
                        <small>Reversed: {workEvent.reversal_reason}</small>
                      ) : null}
                    </td>
                    <td>{treatmentLabel(workEvent)}</td>
                    <td>
                      {workEvent.event_status === "ACTIVE" ? (
                        reversingId === workEvent.work_event_id ? (
                          <div className="payroll-ledger-reversal">
                            <input
                              value={reversalReason}
                              onChange={(changeEvent) =>
                                setReversalReason(changeEvent.target.value)
                              }
                              placeholder="Reversal reason"
                              aria-label="Reversal reason"
                            />
                            <button
                              type="button"
                              className="button button-primary"
                              disabled={saving}
                              onClick={() => submitReversal(workEvent.work_event_id)}
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              className="button"
                              onClick={() => {
                                setReversingId(null);
                                setReversalReason("");
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="payroll-ledger-status payroll-ledger-status--active"
                            onClick={() => setReversingId(workEvent.work_event_id)}
                          >
                            Active · Reverse
                          </button>
                        )
                      ) : (
                        <span className="payroll-ledger-status payroll-ledger-status--reversed">
                          Reversed
                        </span>
                      )}
                    </td>
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
