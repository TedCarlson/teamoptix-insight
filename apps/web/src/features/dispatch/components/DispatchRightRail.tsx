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
  locking: boolean;
  onAddEvent: () => void;
  onUndoEvent: (event: DispatchEventRow) => void;
  onLockDispatch: () => void;
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

export function DispatchRightRail(props: DispatchRightRailProps) {
  const {
    summary,
    dispatchRoutes,
    dispatchDay,
    events,
    locking,
    onAddEvent,
    onUndoEvent,
    onLockDispatch,
  } = props;

  const locked = dispatchDay?.status === "LOCKED";
  const reversedEventIds = getReversedDispatchEventIds(events);

  return (
    <aside style={panel}>
      <div style={panelHeader}>
        <div>
          <p style={eyebrow}>Dispatch</p>
          <strong>{locked ? "Locked snapshot" : "Active workspace"}</strong>
        </div>
      </div>

      <div style={{ padding: 10, display: "grid", gap: 8 }}>
        <Stat label="Routes" value={summary.total} />
        <Stat label="Covered" value={summary.withDriver} />
        <Stat label="Needs Driver" value={summary.withoutDriver} warn={summary.withoutDriver > 0} />

        <div style={{ border: "1px solid #e6edf5", borderRadius: 12, padding: 10, display: "grid", gap: 8 }}>
          <p style={eyebrow}>Lifecycle</p>
          <strong>{locked ? "LOCKED" : "ACTIVE"}</strong>

          {dispatchDay?.locked_at ? (
            <span style={{ color: "#64748b", fontSize: 12 }}>
              Locked {formatTime(dispatchDay.locked_at)}
            </span>
          ) : null}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" style={compactButton} onClick={onAddEvent} disabled={locked}>
              Dispatch Action
            </button>

            <button
              type="button"
              style={{
                ...compactButton,
                borderColor: locked ? "#bbf7d0" : "#2563eb",
                background: locked ? "#f0fdf4" : "#eff6ff",
                color: locked ? "#166534" : "#1d4ed8",
              }}
              onClick={onLockDispatch}
              disabled={locked || locking}
            >
              {locked ? "Locked" : locking ? "Locking..." : "Lock Dispatch"}
            </button>
          </div>
        </div>

        <div style={{ border: "1px solid #e6edf5", borderRadius: 12, padding: 10, display: "grid", gap: 8 }}>
          <p style={eyebrow}>Event log</p>

          {events.length === 0 ? (
            <p style={{ margin: 0, color: "#64748b", fontSize: 13, lineHeight: 1.45 }}>
              No dispatch events recorded yet.
            </p>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {events.slice(-6).reverse().map((event) => {
                const targetLine = eventTargetLine(event);
                const reversed = reversedEventIds.has(event.id);
                const canUndo = isUndoableDispatchEvent(event) && !reversed;

                return (
                  <div
                    key={event.id}
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
                            onClick={() => onUndoEvent(event)}
                            disabled={locked}
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
                              cursor: locked ? "not-allowed" : "pointer",
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
              })}
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
  );
}
