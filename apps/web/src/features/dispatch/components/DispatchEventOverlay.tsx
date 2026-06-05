"use client";

import { useMemo, useState } from "react";
import type { DispatchEventTypeRow, DispatchPerson } from "../lib/dispatchSupport";
import { compactButton, selectedButton } from "../lib/dispatchSupport";

type DispatchEventOverlayProps = {
  open: boolean;
  saving: boolean;
  eventTypes: DispatchEventTypeRow[];
  workforce: DispatchPerson[];
  onClose: () => void;
  onSubmit: (payload: {
    event_code: string;
    event_label: string;
    event_category: string;
    note: string;
    person_roster_member_id: string | null;
    person_name: string | null;
  }) => Promise<void>;
};

function categoryLabel(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function DispatchEventOverlay(props: DispatchEventOverlayProps) {
  const { open, saving, eventTypes, workforce, onClose, onSubmit } = props;

  const manualEventTypes = useMemo(
    () =>
      eventTypes.filter(
        (event) => event.entry_mode === "manual" || event.entry_mode === "both"
      ),
    [eventTypes]
  );

  const groupedEventTypes = useMemo(() => {
    const groups = new Map<string, DispatchEventTypeRow[]>();

    for (const event of manualEventTypes) {
      const key = event.event_category || "DISPATCH";
      groups.set(key, [...(groups.get(key) ?? []), event]);
    }

    return Array.from(groups.entries());
  }, [manualEventTypes]);

  const [eventCode, setEventCode] = useState("");
  const [selectedWorkerId, setSelectedWorkerId] = useState("");
  const [note, setNote] = useState("");

  const selected = useMemo(() => {
    return (
      manualEventTypes.find((option) => option.event_code === eventCode) ??
      manualEventTypes[0] ??
      null
    );
  }, [eventCode, manualEventTypes]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;

    const selectedWorker =
      workforce.find((person) => person.roster_member_id === selectedWorkerId) ??
      null;

    if (selected.requires_person && !selectedWorker) return;
    if (selected.requires_note && !note.trim()) return;

    await onSubmit({
      event_code: selected.event_code,
      event_label: selected.event_label,
      event_category: selected.event_category,
      note,
      person_roster_member_id: selectedWorker?.roster_member_id ?? null,
      person_name: selectedWorker?.full_name ?? null,
    });

    setEventCode("");
    setSelectedWorkerId("");
    setNote("");
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.35)",
        display: "grid",
        placeItems: "center",
        zIndex: 50,
        padding: 16,
      }}
    >
      <section
        style={{
          width: "min(680px, 100%)",
          border: "1px solid #d6dfeb",
          borderRadius: 22,
          background: "#fff",
          boxShadow: "0 24px 60px rgba(15, 23, 42, 0.16)",
          padding: 18,
          maxHeight: "calc(100vh - 32px)",
          overflow: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div>
            <p className="eyebrow">Dispatch event</p>
            <h2 className="app-card__title">Add manual context</h2>
            <p className="app-card__body">
              Select an event type, optionally link a person, and add context only when useful.
            </p>
          </div>

          <button type="button" style={compactButton} onClick={onClose}>
            Close
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ marginTop: 16, display: "grid", gap: 14 }}>
          {groupedEventTypes.length === 0 ? (
            <p className="app-card__body">
              No manual dispatch event presets are active for this company yet.
            </p>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {groupedEventTypes.map(([category, options]) => (
                <div key={category} style={{ display: "grid", gap: 8 }}>
                  <p className="eyebrow" style={{ marginBottom: 0 }}>
                    {categoryLabel(category)}
                  </p>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {options.map((option) => (
                      <button
                        key={option.event_code}
                        type="button"
                        style={
                          option.event_code === selected?.event_code
                            ? selectedButton
                            : compactButton
                        }
                        onClick={() => setEventCode(option.event_code)}
                      >
                        {option.event_label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "grid", gap: 8 }}>
            <label style={{ fontSize: 12, fontWeight: 900, color: "#64748b" }}>
              Person link {selected?.requires_person ? "(required)" : "(optional)"}
            </label>

            <select
              value={selectedWorkerId}
              onChange={(e) => setSelectedWorkerId(e.target.value)}
              required={Boolean(selected?.requires_person)}
              style={{
                height: 42,
                padding: "0 12px",
                borderRadius: 12,
                border: "1px solid #d6dfeb",
                background: "#fff",
              }}
            >
              <option value="">No person linked</option>
              {workforce.map((person) => (
                <option key={person.roster_member_id} value={person.roster_member_id}>
                  {person.full_name} · {person.worker_type || "Worker"}
                </option>
              ))}
            </select>
          </div>

          {selected ? (
            <p className="app-card__body">
              {selected.requires_person ? "This event requires a person link. " : ""}
              {selected.requires_note ? "A note is required. " : "Note is optional. "}
              Source: {selected.source}
            </p>
          ) : null}

          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={selected?.requires_note ? "Required note" : "Optional note or dispatch context"}
            required={Boolean(selected?.requires_note)}
            rows={5}
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 14,
              border: "1px solid #d6dfeb",
              font: "inherit",
              resize: "vertical",
            }}
          />

          <div className="cta-row" style={{ marginTop: 0 }}>
            <button
              type="submit"
              className="button button-primary"
              disabled={saving || manualEventTypes.length === 0}
            >
              {saving ? "Saving..." : "Add event"}
            </button>

            <button type="button" className="button" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
