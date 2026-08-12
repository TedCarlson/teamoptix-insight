import type {
  AssignmentIntent,
  DispatchPerson,
} from "../lib/dispatchSupport";
import {
  eyebrow,
  panel,
  panelHeader,
} from "../lib/dispatchSupport";
import { DispatchAttendanceToggle } from "./DispatchAttendanceToggle";

type DispatchWorkforceRailProps = {
  people: DispatchPerson[];
  intent: AssignmentIntent;
  calloutPersonIds: Set<string>;
  arrivedPersonIds: Set<string>;
  onToggleArrived: (person: DispatchPerson) => void;
  onStagePerson: (person: DispatchPerson) => void;
};

export function DispatchWorkforceRail(props: DispatchWorkforceRailProps) {
  const {
    people,
    intent,
    calloutPersonIds,
    arrivedPersonIds,
    onToggleArrived,
    onStagePerson,
  } = props;

  const presentCount = people.filter((person) =>
    arrivedPersonIds.has(person.roster_member_id)
  ).length;
  const groups = [
    {
      key: "trainees",
      label: "Trainees",
      people: people.filter((person) =>
        !calloutPersonIds.has(person.roster_member_id) &&
        (person.worker_type ?? "").toLowerCase().includes("trainee")
      ),
    },
    {
      key: "drivers",
      label: "Drivers",
      people: people.filter((person) =>
        !calloutPersonIds.has(person.roster_member_id) &&
        !(person.worker_type ?? "").toLowerCase().includes("trainee")
      ),
    },
    {
      key: "callouts",
      label: "Callouts",
      people: people.filter((person) =>
        calloutPersonIds.has(person.roster_member_id)
      ),
    },
  ].filter((group) => group.people.length > 0);

  return (
    <aside className="dispatch-workforce-rail" style={panel}>
      <div style={panelHeader}>
        <div>
          <p style={eyebrow}>Workforce</p>
          <strong>{people.length} awaiting assignment</strong>
        </div>
        <span className="dispatch-workforce-rail__summary">
          {presentCount} present
        </span>
      </div>

      <div className="dispatch-workforce-rail__legend" aria-hidden="true">
        <span>Attendance</span>
        <span>Route assignment</span>
      </div>

      <div className="dispatch-workforce-rail__body">
        {groups.length ? groups.map((group) => (
          <section className="dispatch-workforce-group" key={group.key}>
            <div className="dispatch-workforce-group__label">
              <span>{group.label}</span>
              <strong>{group.people.length}</strong>
            </div>
            <div className="dispatch-workforce-group__rows">
              {group.people.map((person) => {
                const personId = person.roster_member_id;
                const present = arrivedPersonIds.has(personId);
                const calledOut = calloutPersonIds.has(personId);
                const staged = intent?.person.roster_member_id === personId;

                return (
                  <div
                    key={personId}
                    className={`dispatch-workforce-row${staged ? " is-staged" : ""}${calledOut ? " is-called-out" : ""}${calledOut && present ? " is-recovered" : ""}`}
                  >
                    <DispatchAttendanceToggle
                      person={person}
                      present={present}
                      onToggle={onToggleArrived}
                      placement="rail"
                    />

                    <button
                      type="button"
                      className="dispatch-workforce-row__assignment"
                      aria-label={staged ? `Cancel staged assignment for ${person.full_name}` : `Stage ${person.full_name} for assignment`}
                      aria-pressed={staged}
                      onClick={() => onStagePerson(person)}
                      title={staged ? "Tap again to cancel" : `Stage ${person.full_name} for assignment`}
                    >
                      <strong>{person.full_name}</strong>
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )) : (
          <p className="dispatch-workforce-rail__empty">Everyone is assigned.</p>
        )}
      </div>
    </aside>
  );
}
