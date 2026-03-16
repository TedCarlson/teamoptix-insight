"use client";

type PeopleFilter = "drivers_helpers" | "others";

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
          "minmax(240px, 1.15fr) minmax(170px, 0.65fr) minmax(170px, 0.65fr) minmax(190px, 0.75fr)",
      }}
    >
      <input
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search driver, tech, preset, route"
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

      <select
        value={peopleFilter}
        onChange={(e) =>
          onPeopleFilterChange(e.target.value as PeopleFilter)
        }
        style={inputStyle}
      >
        <option value="drivers_helpers">Drivers / Helpers</option>
        <option value="others">All others</option>
      </select>
    </div>
  );
}