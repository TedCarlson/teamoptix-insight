"use client";

import { formatDateTime } from "./automationFormatters";
import { MiniStat, SectionCard } from "./automationShared";
import type { RunnerSchedule } from "./automation.types";

const REPORT_OPTIONS = [
  ["DSW", "Daily Service Worksheet"],
  ["FCC", "Work Area Summary"],
  ["DELIVERY_MANIFEST", "Delivery manifests"],
  ["PICKUP_MANIFEST", "Pickup manifests"],
] as const;

function timeValue(value: string | null | undefined, fallback: string) {
  return (value || fallback).slice(0, 5);
}

function reportList(
  schedule: RunnerSchedule,
  key: "previous_day_close" | "operations_pulse"
) {
  const value = schedule.report_config_json?.[key];
  return Array.isArray(value) ? value : [];
}

export function defaultRunnerSchedule(params: {
  companyId?: string;
  companySlug: string;
  runnerKey?: string;
}): RunnerSchedule {
  const now = new Date().toISOString();
  return {
    id: "",
    company_id: params.companyId ?? "",
    company_slug: params.companySlug,
    runner_key: params.runnerKey ?? "vps-laravel-runner-001",
    timezone: "America/New_York",
    collection_enabled: false,
    previous_day_close_enabled: true,
    previous_day_close_time: "03:00:00",
    operations_pulse_enabled: true,
    operations_pulse_start_time: "07:30:00",
    operations_pulse_end_time: "19:30:00",
    report_config_json: {
      previous_day_close: ["DSW"],
      operations_pulse: [
        "DSW",
        "FCC",
        "DELIVERY_MANIFEST",
        "PICKUP_MANIFEST",
      ],
      operating_weekdays: [1, 2, 3, 4, 5, 6],
      operating_date_overrides: {},
    },
    recovery_config_json: { enabled: false },
    historical_config_json: { enabled: false },
    config_version: 1,
    applied_version: 0,
    runner_state: "PENDING",
    applied_at: null,
    runner_last_seen_at: null,
    runner_last_error: null,
    runner_metadata_json: {},
    created_at: now,
    updated_at: now,
  };
}

export default function RunnerScheduleEditor(props: {
  row: RunnerSchedule;
  disabled: boolean;
  saving: boolean;
  onChange: (row: RunnerSchedule) => void;
  onSave: (row: RunnerSchedule) => void;
}) {
  const synchronized =
    props.row.applied_version >= props.row.config_version &&
    props.row.runner_state !== "ERROR";

  function setReports(
    key: "previous_day_close" | "operations_pulse",
    report: string,
    enabled: boolean
  ) {
    const current = reportList(props.row, key);
    const next = enabled
      ? Array.from(new Set([...current, report]))
      : current.filter((value) => value !== report);

    props.onChange({
      ...props.row,
      report_config_json: {
        ...props.row.report_config_json,
        [key]: next,
      },
    });
  }

  return (
    <SectionCard
      eyebrow="Runner control"
      title="Collection schedule"
    >
      <p style={{ color: "#526681", marginTop: 0, lineHeight: 1.6 }}>
        Program the VPS collection day. Operations Pulse repeats after each
        successful delivery; it is not driven by a fixed interval.
      </p>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          border: "1px solid #dbe7f3",
          borderRadius: 14,
          padding: 12,
          background: props.row.collection_enabled ? "#f0fdf4" : "#f8fafc",
        }}
      >
        <div>
          <strong style={{ display: "block" }}>Automated collection</strong>
          <span style={{ color: "#64748b", fontSize: 12 }}>
            Turning this off prevents new work from starting. Active work may
            finish.
          </span>
        </div>
        <button
          type="button"
          className={props.row.collection_enabled ? "button button-primary" : "button"}
          disabled={props.disabled}
          onClick={() =>
            props.onChange({
              ...props.row,
              collection_enabled: !props.row.collection_enabled,
            })
          }
        >
          {props.row.collection_enabled ? "Collection on" : "Collection off"}
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 12,
          marginTop: 12,
        }}
      >
        <div style={{ border: "1px solid #dbe7f3", borderRadius: 14, padding: 12 }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 900 }}>
            <input
              type="checkbox"
              checked={props.row.previous_day_close_enabled}
              disabled={props.disabled}
              onChange={(event) =>
                props.onChange({
                  ...props.row,
                  previous_day_close_enabled: event.target.checked,
                })
              }
            />
            Previous Day Close
          </label>
          <label style={{ display: "grid", gap: 5, marginTop: 12 }}>
            <span style={{ color: "#64748b", fontSize: 11, fontWeight: 900 }}>
              Clock in
            </span>
            <input
              type="time"
              value={timeValue(props.row.previous_day_close_time, "03:00")}
              disabled={props.disabled}
              onChange={(event) =>
                props.onChange({
                  ...props.row,
                  previous_day_close_time: `${event.target.value}:00`,
                })
              }
            />
          </label>
          <div style={{ display: "grid", gap: 6, marginTop: 12 }}>
            {REPORT_OPTIONS.map(([key, label]) => (
              <label key={key} style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={reportList(props.row, "previous_day_close").includes(key)}
                  disabled={props.disabled}
                  onChange={(event) =>
                    setReports("previous_day_close", key, event.target.checked)
                  }
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        <div style={{ border: "1px solid #dbe7f3", borderRadius: 14, padding: 12 }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 900 }}>
            <input
              type="checkbox"
              checked={props.row.operations_pulse_enabled}
              disabled={props.disabled}
              onChange={(event) =>
                props.onChange({
                  ...props.row,
                  operations_pulse_enabled: event.target.checked,
                })
              }
            />
            Operations Pulse
          </label>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 8,
              marginTop: 12,
            }}
          >
            <label style={{ display: "grid", gap: 5 }}>
              <span style={{ color: "#64748b", fontSize: 11, fontWeight: 900 }}>
                Clock in
              </span>
              <input
                type="time"
                value={timeValue(props.row.operations_pulse_start_time, "07:30")}
                disabled={props.disabled}
                onChange={(event) =>
                  props.onChange({
                    ...props.row,
                    operations_pulse_start_time: `${event.target.value}:00`,
                  })
                }
              />
            </label>
            <label style={{ display: "grid", gap: 5 }}>
              <span style={{ color: "#64748b", fontSize: 11, fontWeight: 900 }}>
                Stop new work
              </span>
              <input
                type="time"
                value={timeValue(props.row.operations_pulse_end_time, "19:30")}
                disabled={props.disabled}
                onChange={(event) =>
                  props.onChange({
                    ...props.row,
                    operations_pulse_end_time: `${event.target.value}:00`,
                  })
                }
              />
            </label>
          </div>
          <div style={{ display: "grid", gap: 6, marginTop: 12 }}>
            {REPORT_OPTIONS.map(([key, label]) => (
              <label key={key} style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 12 }}>
                <input
                  type="checkbox"
                  checked={reportList(props.row, "operations_pulse").includes(key)}
                  disabled={props.disabled}
                  onChange={(event) =>
                    setReports("operations_pulse", key, event.target.checked)
                  }
                />
                {label}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 8,
          marginTop: 12,
        }}
      >
        <MiniStat
          label="Runner sync"
          value={synchronized ? "Applied" : "Pending"}
        />
        <MiniStat
          label="Schedule version"
          value={`${props.row.applied_version}/${props.row.config_version}`}
        />
        <MiniStat
          label="Runner state"
          value={props.row.runner_state}
        />
        <MiniStat
          label="Last applied"
          value={formatDateTime(props.row.applied_at)}
        />
      </div>

      {props.row.runner_last_error ? (
        <p role="alert" style={{ color: "#b91c1c", fontWeight: 800 }}>
          {props.row.runner_last_error}
        </p>
      ) : null}

      <button
        type="button"
        className="button button-primary"
        disabled={props.disabled || props.saving}
        onClick={() => props.onSave(props.row)}
        style={{ marginTop: 12 }}
      >
        {props.saving ? "Saving…" : "Save and apply to runner"}
      </button>
    </SectionCard>
  );
}
