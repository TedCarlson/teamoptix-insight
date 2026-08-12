"use client";

import { useEffect, useMemo, useState } from "react";
import type { AssignmentIntent, DispatchPerson } from "../lib/dispatchSupport";
import { personTypeLabel } from "../lib/dispatchSupport";

type DispatchAttendanceOverlayProps = {
  open: boolean;
  intent: AssignmentIntent;
  people: DispatchPerson[];
  availablePeople: DispatchPerson[];
  callouts: DispatchPerson[];
  arrivedPersonIds: Set<string>;
  onClose: () => void;
  onToggleArrived: (person: DispatchPerson) => void;
  onSelectPerson: (person: DispatchPerson) => void;
};

export function DispatchAttendanceOverlay(props: DispatchAttendanceOverlayProps) {
  const {
    open,
    intent,
    people,
    availablePeople,
    callouts,
    arrivedPersonIds,
    onClose,
    onToggleArrived,
    onSelectPerson,
  } = props;
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  const availableIds = useMemo(
    () => new Set(availablePeople.map((person) => person.roster_member_id)),
    [availablePeople]
  );
  const calloutIds = useMemo(
    () => new Set(callouts.map((person) => person.roster_member_id)),
    [callouts]
  );

  if (!open) return null;

  const needle = query.trim().toLowerCase();
  const filteredPeople = people.filter((person) =>
    `${person.full_name} ${personTypeLabel(person)}`.toLowerCase().includes(needle)
  );
  const presentCount = people.filter((person) =>
    arrivedPersonIds.has(person.roster_member_id)
  ).length;

  return (
    <div
      className="dispatch-attendance-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="dispatch-attendance-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dispatch-attendance-title"
      >
        <header>
          <div>
            <small>Today&apos;s workforce</small>
            <h2 id="dispatch-attendance-title">Attendance</h2>
            <p>{presentCount} of {people.length} marked present</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close attendance">
            ×
          </button>
        </header>

        <div className="dispatch-attendance-search">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a person"
            autoFocus
          />
        </div>

        <div className="dispatch-attendance-list">
          {filteredPeople.length ? filteredPeople.map((person) => {
            const present = arrivedPersonIds.has(person.roster_member_id);
            const available = availableIds.has(person.roster_member_id);
            const calledOut = calloutIds.has(person.roster_member_id);
            const staged = intent?.person.roster_member_id === person.roster_member_id;

            return (
              <div key={person.roster_member_id}>
                <span className="dispatch-attendance-person">
                  <strong>{person.full_name}</strong>
                  <small>
                    {personTypeLabel(person)} · {staged
                      ? "Staged for route assignment"
                      : calledOut && present
                        ? "Present after callout"
                        : calledOut
                          ? "Called out · still actionable"
                          : available
                            ? "Available"
                            : "Assigned"}
                  </small>
                </span>

                <span className="dispatch-attendance-actions">
                  <button
                    type="button"
                    className={present ? "is-present" : ""}
                    onClick={() => onToggleArrived(person)}
                  >
                    {present ? "Present" : "Mark present"}
                  </button>
                  <button
                    type="button"
                    className={staged ? "is-assignment is-staged" : "is-assignment"}
                    aria-pressed={staged}
                    onClick={() => {
                      onSelectPerson(person);
                      onClose();
                    }}
                  >
                    {staged ? "Cancel stage" : "Stage"}
                  </button>
                </span>
              </div>
            );
          }) : (
            <p className="dispatch-attendance-empty">No workforce matches this search.</p>
          )}
        </div>
      </section>
    </div>
  );
}
