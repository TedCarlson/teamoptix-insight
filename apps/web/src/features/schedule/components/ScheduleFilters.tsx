"use client";

type Props = {
  search: string;
  onSearchChange: (value: string) => void;
  rotationFilter: string;
  onRotationFilterChange: (value: string) => void;
  rotationOptions: string[];
  pendingOnly: boolean;
  onPendingOnlyChange: (value: boolean) => void;
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
  } = props;

  return (
    <div
      style={{
        display: "grid",
        gap: 12,
        gridTemplateColumns:
          "minmax(240px, 1.2fr) minmax(180px, 0.7fr) minmax(180px, 0.7fr)",
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
    </div>
  );
}