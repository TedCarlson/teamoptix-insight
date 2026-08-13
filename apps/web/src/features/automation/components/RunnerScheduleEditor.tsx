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
      dro_am: {
        enabled: true,
        start_time: "04:00",
        reports: ["DRO"],
      },
      run_gate: {
        authority: "MANUAL",
        manual_state: "INACTIVE",
      },
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
  const droAm = props.row.report_config_json.dro_am ?? {
    enabled: true,
    start_time: "04:00",
    reports: ["DRO"],
  };
  const runGate = props.row.report_config_json.run_gate ?? {
    authority: "MANUAL" as const,
    manual_state: props.row.collection_enabled
      ? ("ACTIVE" as const)
      : ("INACTIVE" as const),
  };

  function setDroAm(
    patch: Partial<NonNullable<RunnerSchedule["report_config_json"]["dro_am"]>>
  ) {
    props.onChange({
      ...props.row,
      report_config_json: {
        ...props.row.report_config_json,
        dro_am: { ...droAm, ...patch },
      },
    });
  }

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
      title="Collection master switch"
    >
      <p style={{ color: "#526681", marginTop: 0, lineHeight: 1.6 }}>
        Team Optix owns this signed master gate for the three daily runner
        jobs. Historical sweeps and targeted recovery remain ticket-queue work.
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
          <strong style={{ display: "block" }}>Collection</strong>
          <span style={{ color: "#64748b", fontSize: 12 }}>
            Collection Off prevents new work from starting. Active work may
            finish safely.
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
              report_config_json: {
                ...props.row.report_config_json,
                run_gate: {
                  ...runGate,
                  manual_state: props.row.collection_enabled
                    ? "INACTIVE"
                    : "ACTIVE",
                },
              },
            })
          }
        >
          {props.row.collection_enabled ? "Collection On" : "Collection Off"}
        </button>
      </div>

      <div style={{ border: "1px solid #dbe7f3", borderRadius: 14, padding: 12, marginTop: 12 }}>
        <strong style={{ display: "block" }}>Control authority</strong>
        <p style={{ color: "#64748b", fontSize: 12, lineHeight: 1.5 }}>
          Manual authority is active now. Billing authority is the next control
          depth and will resolve this same signed run/rest gate from verified
          payment and subscription state.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button type="button" className="button button-primary" disabled>
            Manual · authoritative
          </button>
          <button type="button" className="button" disabled title="Billing gate wiring is not active yet.">
            Billing &amp; payment · prepared
          </button>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 12,
          marginTop: 12,
        }}
      >
        <div style={{ border: "1px solid #dbe7f3", borderRadius: 14, padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
            <strong>Prior Day</strong>
            <button
              type="button"
              className={props.row.previous_day_close_enabled ? "button button-primary" : "button"}
              disabled={props.disabled}
              onClick={() => props.onChange({
                ...props.row,
                previous_day_close_enabled: !props.row.previous_day_close_enabled,
              })}
            >
              {props.row.previous_day_close_enabled ? "Active" : "Inactive"}
            </button>
          </div>
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
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
            <strong>DRO AM</strong>
            <button
              type="button"
              className={droAm.enabled !== false ? "button button-primary" : "button"}
              disabled={props.disabled}
              onClick={() => setDroAm({ enabled: droAm.enabled === false })}
            >
              {droAm.enabled !== false ? "Active" : "Inactive"}
            </button>
          </div>
          <label style={{ display: "grid", gap: 5, marginTop: 12 }}>
            <span style={{ color: "#64748b", fontSize: 11, fontWeight: 900 }}>
              Clock in
            </span>
            <input
              type="time"
              value={timeValue(droAm.start_time, "04:00")}
              disabled={props.disabled}
              onChange={(event) => setDroAm({ start_time: event.target.value })}
            />
          </label>
          <p style={{ color: "#64748b", fontSize: 12, lineHeight: 1.5, marginBottom: 0 }}>
            Collects the morning DRO package once per operating date.
          </p>
        </div>

        <div style={{ border: "1px solid #dbe7f3", borderRadius: 14, padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
            <strong>Continuous Collection</strong>
            <button
              type="button"
              className={props.row.operations_pulse_enabled ? "button button-primary" : "button"}
              disabled={props.disabled}
              onClick={() => props.onChange({
                ...props.row,
                operations_pulse_enabled: !props.row.operations_pulse_enabled,
              })}
            >
              {props.row.operations_pulse_enabled ? "Active" : "Inactive"}
            </button>
          </div>
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
          <p style={{ color: "#166534", fontSize: 12, fontWeight: 850, lineHeight: 1.5 }}>
            Collects and hands off each file independently. The next collection
            starts after the current collection cycle finishes.
          </p>
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
          label="Authority"
          value={runGate.authority === "BILLING" ? "Billing & payment" : "Manual"}
        />
        <MiniStat
          label="Master collection gate"
          value={props.row.collection_enabled ? "ON" : "OFF"}
        />
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
