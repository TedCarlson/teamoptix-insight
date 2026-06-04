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
  onCancelAssign: () => void;
  onSelectPerson: (person: DispatchPerson) => void;
};

export function DispatchWorkforceRail(props: DispatchWorkforceRailProps) {
  const {
    allPeopleCount,
    availableCount,
    intent,
    availablePeople,
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
            <p style={eyebrow}>Callouts</p>
            <strong>0</strong>
          </div>

          <div
            style={{
              color: "#94a3b8",
              fontSize: 12,
            }}
          >
            No callouts recorded.
          </div>
        </section>
      </div>
    </aside>
  );
}
