import type {
  AssignmentIntent,
  DispatchPerson,
} from "../lib/dispatchSupport";
import {
  compactButton,
  eyebrow,
  panel,
  panelHeader,
} from "../lib/dispatchSupport";
import { WorkforceGroup } from "./DispatchRails";

type DispatchWorkforceRailProps = {
  allPeopleCount: number;
  availableCount: number;
  intent: AssignmentIntent;
  availablePeople: DispatchPerson[];
  callouts: DispatchPerson[];
  arrivedPersonIds: Set<string>;
  onToggleArrived: (person: DispatchPerson) => void;
  onCancelAssign: () => void;
  onSelectPerson: (person: DispatchPerson) => void;
};

export function DispatchWorkforceRail(props: DispatchWorkforceRailProps) {
  const {
    allPeopleCount,
    availableCount,
    intent,
    availablePeople,
    callouts,
    arrivedPersonIds,
    onToggleArrived,
    onCancelAssign,
    onSelectPerson,
  } = props;

  return (
    <aside style={panel}>
      <div style={panelHeader}>
        <div>
          <p style={eyebrow}>Workforce</p>
          <strong>{allPeopleCount} scheduled</strong>
        </div>
        <span style={{ fontSize: 12, fontWeight: 900, color: "#166534" }}>
          {availableCount} free
        </span>
      </div>

      <div style={{ padding: 10, display: "grid", gap: 8 }}>
        {intent ? (
          <div
            style={{
              border: "1px solid #bfdbfe",
              background: "#eff6ff",
              borderRadius: 12,
              padding: 10,
              display: "grid",
              gap: 8,
            }}
          >
            <p style={{ ...eyebrow, color: "#1d4ed8" }}>Assign mode</p>
            <strong style={{ fontSize: 13 }}>
              {intent.seat.toUpperCase()} → {intent.route_label}
            </strong>
            <button type="button" onClick={onCancelAssign} style={compactButton}>
              Cancel
            </button>
          </div>
        ) : (
          <div
            style={{
              border: "1px solid #e6edf5",
              borderRadius: 12,
              padding: 10,
              color: "#64748b",
              fontSize: 13,
              lineHeight: 1.45,
            }}
          >
            Tap a route seat, then tap a worker.
          </div>
        )}

        <WorkforceGroup
          title="Available Drivers"
          people={availablePeople}
          intent={intent}
          onSelect={onSelectPerson}
        />

        <section
          style={{
            border: "1px solid #e6edf5",
            borderRadius: 12,
            padding: 10,
            display: "grid",
            gap: 6,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 8,
              alignItems: "center",
            }}
          >
            <p style={eyebrow}>Arrival check</p>
            <strong style={{ color: "#64748b" }}>
              {arrivedPersonIds.size}
            </strong>
          </div>

          {availablePeople.length ? (
            <div style={{ display: "grid", gap: 6 }}>
              {availablePeople.map((person) => {
                const arrived = arrivedPersonIds.has(person.roster_member_id);

                return (
                  <div
                    key={`arrival-${person.roster_member_id}`}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 32px",
                      gap: 8,
                      alignItems: "center",
                      border: "1px solid #e6edf5",
                      borderRadius: 10,
                      padding: "7px 8px",
                      fontSize: 12,
                      fontWeight: 800,
                    }}
                  >
                    <span>{person.full_name}</span>
                    <button
                      type="button"
                      aria-label={arrived ? "Arrived verified" : "Arrival not verified"}
                      title={arrived ? "Arrived verified" : "Arrival not verified"}
                      onClick={() => onToggleArrived(person)}
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 999,
                        border: arrived ? "1px solid #86efac" : "1px solid #cbd5e1",
                        background: arrived ? "#dcfce7" : "#f8fafc",
                        color: arrived ? "#166534" : "#64748b",
                        fontWeight: 950,
                        cursor: "pointer",
                      }}
                    >
                      {arrived ? "✓" : "?"}
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ color: "#94a3b8", fontSize: 12 }}>
              No available drivers to verify.
            </div>
          )}
        </section>

        <section
          style={{
            border: "1px solid #e6edf5",
            borderRadius: 12,
            padding: 10,
            display: "grid",
            gap: 6,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 8,
              alignItems: "center",
            }}
          >
            <p style={eyebrow}>Callouts</p>
            <strong style={{ color: callouts.length ? "#b42318" : "#64748b" }}>
              {callouts.length}
            </strong>
          </div>

          {callouts.length ? (
            <div style={{ display: "grid", gap: 6 }}>
              {callouts.map((person) => (
                <div
                  key={person.roster_member_id}
                  style={{
                    border: "1px solid #fecaca",
                    background: "#fff1f2",
                    color: "#991b1b",
                    borderRadius: 10,
                    padding: "7px 8px",
                    fontSize: 12,
                    fontWeight: 800,
                  }}
                >
                  {person.full_name}
                </div>
              ))}
            </div>
          ) : (
            <div
              style={{
                color: "#94a3b8",
                fontSize: 12,
              }}
            >
              No callouts recorded.
            </div>
          )}
        </section>
      </div>
    </aside>
  );
}
