"use client";

import { useState } from "react";
import type {
  DispatchDayRow,
  DispatchEventRow,
  DispatchRoute,
} from "../lib/dispatchSupport";
import {
  compactButton,
  eyebrow,
  getReversedDispatchEventIds,
  isUndoableDispatchEvent,
  panel,
  panelHeader,
} from "../lib/dispatchSupport";
import { AssignmentRailSection, Stat } from "./DispatchRails";

type DispatchSummary = {
  total: number;
  withDriver: number;
  withoutDriver: number;
  helpers: number;
  trainees: number;
  available: number;
};

type DispatchRightRailProps = {
  summary: DispatchSummary;
  dispatchRoutes: DispatchRoute[];
  dispatchDay: DispatchDayRow | null;
  events: DispatchEventRow[];
  onAddEvent: () => void;
  onUndoEvent: (event: DispatchEventRow) => void;
};

function formatTime(value: string) {
  try {
    return new Date(value).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

function eventTargetLine(event: DispatchEventRow) {
  return [event.person_name, event.route_label].filter(Boolean).join(" · ");
}

function EventEntry(props: {
  event: DispatchEventRow;
  reversed: boolean;
  onUndo: (event: DispatchEventRow) => void;
}) {
  const { event, reversed, onUndo } = props;
  const targetLine = eventTargetLine(event);
  const canUndo = isUndoableDispatchEvent(event) && !reversed;

  return (
    <div
      style={{
        borderTop: "1px solid #eef2f7",
        paddingTop: 8,
        display: "grid",
        gap: 3,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <strong style={{ fontSize: 13, lineHeight: 1.25 }}>{event.event_label}</strong>

        <div style={{ display: "grid", gap: 2, justifyItems: "end", flex: "0 0 auto" }}>
          <span style={{ color: "#64748b", fontSize: 12 }}>
            {formatTime(event.created_at)}
          </span>

          {canUndo ? (
            <button
              type="button"
              onClick={() => onUndo(event)}
              style={{
                minHeight: 18,
                padding: "0 6px",
                borderRadius: 7,
                border: "1px solid #d6dfeb",
                background: "#fff",
                color: "#64748b",
                fontSize: 10,
                fontWeight: 900,
                lineHeight: 1,
                cursor: "pointer",
              }}
            >
              Undo
            </button>
          ) : null}

          {reversed ? (
            <span style={{ color: "#94a3b8", fontSize: 10, fontWeight: 900 }}>
              Reversed
            </span>
          ) : null}
        </div>
      </div>

      {targetLine ? (
        <span style={{ color: "#64748b", fontSize: 12 }}>
          {targetLine}
        </span>
      ) : null}

      {event.note ? (
        <p style={{ margin: "2px 0 0", color: "#334155", fontSize: 12 }}>
          {event.note}
        </p>
      ) : null}
    </div>
  );
}

export function DispatchRightRail(props: DispatchRightRailProps) {
  const {
    summary,
    dispatchRoutes,
    dispatchDay,
    events,
    onAddEvent,
    onUndoEvent,
  } = props;

  const deliveryPhase = dispatchDay?.status === "LOCKED";
  const reversedEventIds = getReversedDispatchEventIds(events);
  const [eventLogOpen, setEventLogOpen] = useState(false);

  return (
    <>
    <aside style={panel}>
      <div style={panelHeader}>
        <div>
          <p style={eyebrow}>Dispatch</p>
          <strong>{deliveryPhase ? "Delivery phase" : "Dispatch phase"}</strong>
        </div>
      </div>

      <div style={{ padding: 10, display: "grid", gap: 8 }}>
        <div className="dispatch-right-rail__stats">
          <Stat label="Routes" value={summary.total} />
          <Stat label="Covered" value={summary.withDriver} />
          <Stat label="Needs Driver" value={summary.withoutDriver} warn={summary.withoutDriver > 0} />
        </div>

        <div style={{ border: "1px solid #e6edf5", borderRadius: 12, padding: 10, display: "grid", gap: 8 }}>
          <p style={eyebrow}>Working phase</p>
          <strong>{deliveryPhase ? "DELIVERY" : "DISPATCH"}</strong>

          {dispatchDay?.locked_at ? (
            <span style={{ color: "#64748b", fontSize: 12 }}>
              Handed off {formatTime(dispatchDay.locked_at)}
            </span>
          ) : null}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" style={compactButton} onClick={onAddEvent}>
              {deliveryPhase ? "Delivery Action" : "Dispatch Action"}
            </button>
          </div>
        </div>

        <div style={{ border: "1px solid #e6edf5", borderRadius: 12, padding: 10, display: "grid", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
            <p style={eyebrow}>Recent activity</p>
            {events.length > 3 ? (
              <button type="button" style={railLinkButton} onClick={() => setEventLogOpen(true)}>
                All {events.length}
              </button>
            ) : null}
          </div>

          {events.length === 0 ? (
            <p style={{ margin: 0, color: "#64748b", fontSize: 13, lineHeight: 1.45 }}>
              No dispatch events recorded yet.
            </p>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {events.slice(-3).reverse().map((event) => (
                <EventEntry
                  key={event.id}
                  event={event}
                  reversed={reversedEventIds.has(event.id)}
                  onUndo={onUndoEvent}
                />
              ))}
            </div>
          )}
        </div>

        {summary.trainees > 0 ? (
          <AssignmentRailSection
            title="Trainees"
            emptyText="No trainees assigned"
            routes={dispatchRoutes}
            seat="trainee"
          />
        ) : null}
      </div>
    </aside>

    {eventLogOpen ? (
      <div role="presentation" onClick={() => setEventLogOpen(false)} style={eventLogBackdrop}>
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="dispatch-event-history-title"
          onClick={(event) => event.stopPropagation()}
          style={eventLogDialog}
        >
          <div style={{ display: "flex", alignItems: "start", justifyContent: "space-between", gap: 16 }}>
            <div>
              <p style={eyebrow}>Dispatch activity</p>
              <h2 id="dispatch-event-history-title" style={{ margin: "4px 0 0", fontSize: 22 }}>
                Event history
              </h2>
            </div>
            <button type="button" style={compactButton} onClick={() => setEventLogOpen(false)}>
              Close
            </button>
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            {events.length ? events.slice().reverse().map((event) => (
              <EventEntry
                key={event.id}
                event={event}
                reversed={reversedEventIds.has(event.id)}
                onUndo={onUndoEvent}
              />
            )) : (
              <p style={{ margin: 0, color: "#64748b" }}>No dispatch events recorded yet.</p>
            )}
          </div>
        </section>
      </div>
    ) : null}
    </>
  );
}

const railLinkButton: React.CSSProperties = {
  minHeight: 24,
  padding: "0 7px",
  border: 0,
  background: "transparent",
  color: "#1d4ed8",
  cursor: "pointer",
  fontSize: 11,
  fontWeight: 900,
};

const eventLogBackdrop: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 80,
  display: "grid",
  placeItems: "center",
  padding: 16,
  background: "rgba(15, 23, 42, 0.35)",
};

const eventLogDialog: React.CSSProperties = {
  width: "min(680px, 100%)",
  maxHeight: "calc(100vh - 32px)",
  overflow: "auto",
  border: "1px solid #d6dfeb",
  borderRadius: 18,
  background: "#fff",
  boxShadow: "0 28px 80px rgba(15, 23, 42, 0.24)",
  padding: 18,
  display: "grid",
  gap: 14,
};
