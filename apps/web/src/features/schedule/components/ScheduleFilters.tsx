"use client";

export type PeopleFilter = "drivers_helpers" | "others";

type Props = {
  search: string;
  onSearchChange: (value: string) => void;
  rotationFilter: string;
  onRotationFilterChange: (value: string) => void;
  rotationOptions: string[];
  pendingOnly: boolean;
  onPendingOnlyChange: (value: boolean) => void;
  peopleFilter: PeopleFilter;
  onPeopleFilterChange: (value: PeopleFilter) => void;
};

const inputStyle: React.CSSProperties = {
  height: 40,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid #d6dfeb",
  background: "#fff",
};

export default function ScheduleFilters(props: Props) {
  const {
    search,
    onSearchChange,
    rotationFilter,
    onRotationFilterChange,
    rotationOptions,
    pendingOnly,
    onPendingOnlyChange,
    peopleFilter,
    onPeopleFilterChange,
  } = props;

  return (
    <div
      style={{
        display: "grid",
        gap: 12,
        gridTemplateColumns:
          "minmax(240px, 1.15fr) minmax(170px, 0.65fr) minmax(170px, 0.65fr) minmax(250px, 0.8fr)",
      }}
    >
      <input
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search team member, preset, route"
        style={inputStyle}
      />

      <select
        value={rotationFilter}
        onChange={(e) => onRotationFilterChange(e.target.value)}
        style={inputStyle}
      >
        <option value="ALL">All rotations</option>
        <option value="__NONE__">No rotation</option>
        {rotationOptions.map((rotation) => (
          <option key={rotation} value={rotation}>
            {rotation}
          </option>
        ))}
      </select>

      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          height: 40,
          padding: "0 12px",
          borderRadius: 10,
          border: "1px solid #d6dfeb",
          background: "#fff",
        }}
      >
        <input
          type="checkbox"
          checked={pendingOnly}
          onChange={(e) => onPendingOnlyChange(e.target.checked)}
        />
        <span>Pending only</span>
      </label>

      <div
        aria-label="Workforce group"
        role="group"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 6,
          minWidth: 0,
        }}
      >
        {([
          ["drivers_helpers", "Drivers / Helpers"],
          ["others", "All others"],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            aria-pressed={peopleFilter === value}
            className={peopleFilter === value ? "button button-primary" : "button"}
            onClick={() => onPeopleFilterChange(value)}
            style={{ minHeight: 40, padding: "0 10px", borderRadius: 10, fontSize: 12 }}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
