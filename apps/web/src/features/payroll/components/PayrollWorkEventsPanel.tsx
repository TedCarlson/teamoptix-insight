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

export default function PayrollWorkEventsPanel({
  slug,
  days,
  roster,
  onChanged,
}: Props) {
  const [events, setEvents] = useState<PayrollWorkEvent[]>([]);
  const [rosterMemberId, setRosterMemberId] = useState("");
  const [serviceDate, setServiceDate] = useState(
    days[days.length - 1] ?? ""
  );
  const [eventType, setEventType] =
    useState<PayrollWorkEvent["event_type"]>("TRAINING_DAY");
  const [payTreatment, setPayTreatment] = useState<
    PayrollWorkEvent["pay_treatment"]
  >("ONE_DAY_RATE");
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
      const response = await fetch(
        `/api/company/${slug}/payroll/work-events`,
        {
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
        }
      );
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
      const response = await fetch(
        `/api/company/${slug}/payroll/work-events`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            action: "reverse",
            work_event_id: workEventId,
            reason: reversalReason,
          }),
        }
      );
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
    <section
      style={{
        border: "1px solid #dbe7f3",
        borderRadius: 16,
        background: "#fff",
        padding: 16,
        display: "grid",
        gap: 16,
      }}
    >
      <div>
        <p className="value-card__eyebrow">Fallback work evidence</p>
        <h3 className="app-card__title">Add a missed or overridden work day</h3>
        <p className="app-card__body">
          Training and helper events fill missing work evidence. Walk-on events
          apply an explicit pay treatment while DSW remains authoritative for
          route production.
        </p>
      </div>

      <form
        onSubmit={submitCreate}
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(min(100%, 180px), 1fr))",
          gap: 10,
          alignItems: "end",
        }}
      >
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 900 }}>Person</span>
          <select
            value={rosterMemberId}
            onChange={(event) => setRosterMemberId(event.target.value)}
            required
            className="workspace-select"
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

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 900 }}>Service date</span>
          <select
            value={serviceDate}
            onChange={(event) => setServiceDate(event.target.value)}
            required
            className="workspace-select"
          >
            {days.map((day) => (
              <option key={day} value={day}>
                {day}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 900 }}>Work type</span>
          <select
            value={eventType}
            onChange={(event) =>
              {
                setEventType(
                  event.target.value as PayrollWorkEvent["event_type"]
                );
                setRosterMemberId("");
              }
            }
            required
            className="workspace-select"
          >
            <option value="TRAINING_DAY">Training day</option>
            <option value="HELPER_DAY">Helper day</option>
            <option value="WALK_ON_DAY">Walk-on day</option>
          </select>
        </label>

        {eventType === "WALK_ON_DAY" ? (
          <>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 900 }}>Pay treatment</span>
              <select
                value={payTreatment}
                onChange={(event) =>
                  setPayTreatment(
                    event.target.value as PayrollWorkEvent["pay_treatment"]
                  )
                }
                className="workspace-select"
              >
                <option value="ONE_DAY_RATE">One-day rate</option>
                <option value="INTERCOMPANY">Intercompany / no employee pay</option>
              </select>
            </label>
            {payTreatment === "ONE_DAY_RATE" ? (
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 900 }}>One-day rate</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={overrideDailyPayRate}
                  onChange={(event) => setOverrideDailyPayRate(event.target.value)}
                  required
                  placeholder="0.00"
                  className="workspace-input"
                />
              </label>
            ) : null}
          </>
        ) : null}

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 900 }}>
            Reason or supporting note
          </span>
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            required
            placeholder="What was missed and how was it verified?"
            className="workspace-input"
          />
        </label>

        <button
          type="submit"
          className="button payroll-action-button"
          disabled={saving}
        >
          {saving ? "Saving..." : "Add event"}
        </button>
      </form>

      {error ? (
        <div role="alert" style={{ color: "#991b1b", fontWeight: 800 }}>
          {error}
        </div>
      ) : null}
      {notice ? (
        <div role="status" style={{ color: "#166534", fontWeight: 800 }}>
          {notice}
        </div>
      ) : null}

      <div style={{ display: "grid", gap: 8 }}>
        <strong>Event log for this payroll week</strong>
        {loading ? (
          <span className="muted">Loading work events...</span>
        ) : events.length === 0 ? (
          <span className="muted">No manual fallback events recorded.</span>
        ) : (
          events.map((event) => (
            <div
              key={event.work_event_id}
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(min(100%, 150px), 1fr))",
                gap: 12,
                alignItems: "center",
                borderTop: "1px solid #e6edf5",
                paddingTop: 10,
                color: event.event_status === "REVERSED" ? "#94a3b8" : "#334155",
              }}
            >
              <span>{event.service_date}</span>
              <strong>{event.person_name}</strong>
              <span>{eventLabel(event.event_type)}</span>
              <span>
                {event.note}
                {event.event_type === "WALK_ON_DAY"
                  ? ` · ${event.pay_treatment === "ONE_DAY_RATE" ? `$${Number(event.override_daily_pay_rate ?? 0).toFixed(2)}` : event.pay_treatment.replaceAll("_", " ").toLowerCase()}`
                  : ""}
                {event.reversal_reason
                  ? ` · Reversed: ${event.reversal_reason}`
                  : ""}
              </span>
              {event.event_status === "ACTIVE" ? (
                reversingId === event.work_event_id ? (
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      value={reversalReason}
                      onChange={(changeEvent) =>
                        setReversalReason(changeEvent.target.value)
                      }
                      placeholder="Reason"
                      className="workspace-input"
                    />
                    <button
                      type="button"
                      className="button"
                      disabled={saving}
                      onClick={() => submitReversal(event.work_event_id)}
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
                    className="button"
                    onClick={() => setReversingId(event.work_event_id)}
                  >
                    Reverse
                  </button>
                )
              ) : (
                <strong>Reversed</strong>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
