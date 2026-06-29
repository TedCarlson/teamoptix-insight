import type { ScheduleRow } from "./automation.types";
import { formatWindow } from "./automationFormatters";
import { MiniStat, OptionButton } from "./automationShared";
import { summaryLabel, timeBox, timeInput } from "./automationStyles";

export function ScheduleEditor(props: {
  row: ScheduleRow;
  disabled: boolean;
  saving: boolean;
  onChange: (row: ScheduleRow) => void;
  onSave: (row: ScheduleRow) => void;
}) {
  const enabled = props.row.is_enabled && props.row.window_preset !== "OFF";

  return (
    <div
      style={{
        border: "1px solid #dbe7f3",
        borderRadius: 16,
        padding: 12,
        background: "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)",
        display: "grid",
        gap: 10,
        boxShadow: "0 10px 28px rgba(15, 23, 42, 0.04)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <div>
          <p className="value-card__eyebrow" style={{ margin: 0 }}>
            Automation
          </p>
          <h3 className="app-card__title" style={{ margin: "2px 0 0", fontSize: 18 }}>
            {props.row.automation_type}
          </h3>
        </div>

        <button
          type="button"
          disabled={props.disabled}
          onClick={() =>
            props.onChange({
              ...props.row,
              is_enabled: !enabled,
              window_preset: !enabled && props.row.window_preset === "OFF" ? "SORT_DELIVERY_DAY" : props.row.window_preset,
            })
          }
          style={{
            border: enabled ? "1px solid #86efac" : "1px solid #d6dfeb",
            background: enabled ? "#f0fdf4" : "#f8fafc",
            color: enabled ? "#166534" : "#64748b",
            borderRadius: 999,
            minHeight: 32,
            padding: "0 12px",
            fontSize: 12,
            fontWeight: 950,
            cursor: props.disabled ? "not-allowed" : "pointer",
          }}
        >
          {enabled ? "Enabled" : "Disabled"}
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "0.8fr 1.2fr", gap: 10 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <span style={summaryLabel}>Cadence</span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[15, 30, 60].map((minutes) => (
            <OptionButton
              key={minutes}
              active={props.row.cadence_minutes === minutes}
              disabled={props.disabled}
              onClick={() => props.onChange({ ...props.row, cadence_minutes: minutes })}
            >
              {minutes === 60 ? "Hourly" : `${minutes} min`}
            </OptionButton>
          ))}
          </div>
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          <span style={summaryLabel}>Run Window</span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[
            ["SORT_DELIVERY_DAY", "Sort + Delivery"],
            ["BUSINESS_DAY", "Business Day"],
            ["OFF", "Off"],
          ].map(([value, label]) => (
            <OptionButton
              key={value}
              active={props.row.window_preset === value}
              disabled={props.disabled}
              onClick={() =>
                props.onChange({
                  ...props.row,
                  window_preset: value,
                  is_enabled: value === "OFF" ? false : props.row.is_enabled,
                })
              }
            >
              {label}
            </OptionButton>
          ))}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
        <label style={timeBox}>
          <span style={summaryLabel}>Start</span>
          <input
            type="time"
            value={props.row.start_time.slice(0, 5)}
            disabled={props.disabled}
            onChange={(event) =>
              props.onChange({
                ...props.row,
                start_time: `${event.target.value}:00`,
              })
            }
            style={timeInput}
          />
        </label>

        <label style={timeBox}>
          <span style={summaryLabel}>End</span>
          <input
            type="time"
            value={props.row.end_time.slice(0, 5)}
            disabled={props.disabled}
            onChange={(event) =>
              props.onChange({
                ...props.row,
                end_time: `${event.target.value}:00`,
              })
            }
            style={timeInput}
          />
        </label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
        <MiniStat label="Window" value={formatWindow(props.row)} />
        <MiniStat label="Cooldown" value={`${props.row.min_cooldown_minutes} min`} />
        <MiniStat label="State" value={enabled ? "Active" : "Paused"} />
      </div>

      <button
        type="button"
        className="button button-primary"
        disabled={props.disabled || props.saving}
        onClick={() => props.onSave(props.row)}
        style={{ minHeight: 36 }}
      >
        {props.saving ? "Saving..." : "Save"}
      </button>
    </div>
  );
}

