import type { DispatchPerson } from "../lib/dispatchSupport";

type DispatchAttendanceToggleProps = {
  person: DispatchPerson;
  present: boolean;
  onToggle: (person: DispatchPerson) => void;
  placement: "rail" | "table";
};

export function DispatchAttendanceToggle({
  person,
  present,
  onToggle,
  placement,
}: DispatchAttendanceToggleProps) {
  return (
    <button
      type="button"
      className={`dispatch-attendance-toggle dispatch-attendance-toggle--${placement}${present ? " is-present" : ""}`}
      aria-label={`${present ? "Mark absent" : "Mark present"}: ${person.full_name}`}
      aria-pressed={present}
      title={present ? "Present" : "Absent"}
      onClick={() => onToggle(person)}
    >
      <span aria-hidden="true">{present ? "✓" : "—"}</span>
    </button>
  );
}
