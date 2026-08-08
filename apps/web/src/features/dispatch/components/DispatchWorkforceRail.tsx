import type {
  AssignmentIntent,
  DispatchPerson,
} from "../lib/dispatchSupport";
import {
  compactButton,
  eyebrow,
  panel,
  panelHeader,
  personTypeLabel,
} from "../lib/dispatchSupport";

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
    <aside className="dispatch-workforce-rail" style={panel}>
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
            <p style={eyebrow}>Available drivers</p>
            <strong style={{ color: "#64748b" }}>
              {availablePeople.length}
            </strong>
          </div>

          {availablePeople.length ? (
            <div style={{ display: "grid", gap: 6 }}>
              {availablePeople.map((person) => {
                const arrived = arrivedPersonIds.has(person.roster_member_id);

                return (
                  <div
                    key={`available-${person.roster_member_id}`}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 32px",
                      gap: 6,
                      alignItems: "center",
                      border: "1px solid #e6edf5",
                      borderRadius: 10,
                      padding: 4,
                      fontSize: 12,
                      fontWeight: 800,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectPerson(person)}
                      disabled={!intent}
                      title={intent ? `Assign ${person.full_name}` : personTypeLabel(person)}
                      style={{
                        minWidth: 0,
                        minHeight: 36,
                        padding: "4px 6px",
                        border: 0,
                        borderRadius: 7,
                        background: intent ? "#eff6ff" : "transparent",
                        color: intent ? "#0f172a" : "#334155",
                        cursor: intent ? "pointer" : "default",
                        textAlign: "left",
                      }}
                    >
                      <strong
                        style={{
                          display: "block",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {person.full_name}
                      </strong>
                      <span style={{ display: "block", marginTop: 1, color: "#64748b", fontSize: 10 }}>
                        {personTypeLabel(person)}
                      </span>
                    </button>
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
              No available drivers.
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
