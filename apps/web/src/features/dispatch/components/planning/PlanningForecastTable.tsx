"use client";

import { panel } from "../../lib/dispatchSupport";
import type { DroPlanRow } from "../../lib/droPlanSignals";

function formatForecastNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "—";
  return Number.isInteger(numeric)
    ? numeric.toLocaleString()
    : numeric.toFixed(1);
}

function formatForecastDecimal(value: unknown, digits = 1) {
  if (value === null || value === undefined || value === "") return "—";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "—";
  return numeric.toFixed(digits);
}

function ForecastSignal({
  value,
  label,
}: {
  value: string;
  label: string;
}) {
  return (
    <strong
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        minHeight: 34,
        border: "1px solid #edf2f7",
        borderRadius: 12,
        padding: "0 10px",
        color: "#334155",
        background: "#fff",
        fontSize: 13,
        fontWeight: 900,
      }}
    >
      <span>{value}</span>
      <span style={{ color: "#64748b", fontSize: 11 }}>
        {label}
      </span>
    </strong>
  );
}

export default function PlanningForecastTable({
  rows,
  sourceFrame,
}: {
  rows: DroPlanRow[];
  sourceFrame: "AM" | "PM" | null;
}) {
  return (
    <section style={{ ...panel, overflow: "hidden" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "minmax(220px, 1fr) repeat(6, minmax(105px, 0.55fr))",
          gap: 10,
          alignItems: "center",
          padding: "10px 14px",
          background: "#f8fafc",
          borderBottom: "1px solid #edf2f7",
          color: "#64748b",
          fontSize: 11,
          fontWeight: 900,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        <div>Route</div>
        <div>Stops</div>
        <div>Packages</div>
        <div>Commits</div>
        <div>Miles</div>
        <div>Pkg / Stop</div>
        <div>Min / Stop</div>
      </div>

      {rows.length === 0 ? (
        <p
          style={{
            margin: 0,
            padding: 14,
            color: "#64748b",
            fontWeight: 700,
          }}
        >
          No forecast routes loaded.
        </p>
      ) : (
        rows.map((row) => {
          const key =
            row.wa_number ||
            row.route_name ||
            crypto.randomUUID();

          const packagesPerStop =
            Number(row.stops ?? 0) > 0
              ? Number(row.packages ?? 0) /
                Number(row.stops ?? 1)
              : null;

          return (
            <div
              key={key}
              style={{
                display: "grid",
                gridTemplateColumns:
                  "minmax(220px, 1fr) repeat(6, minmax(105px, 0.55fr))",
                gap: 10,
                alignItems: "center",
                padding: "10px 14px",
                borderBottom: "1px solid #edf2f7",
                background: "#fff",
              }}
            >
              <div>
                <strong
                  style={{
                    display: "block",
                    fontSize: 15,
                  }}
                >
                  {[row.route_name, row.wa_number]
                    .filter(Boolean)
                    .join(" · ")}
                </strong>

                <span
                  style={{
                    color: "#64748b",
                    fontSize: 12,
                    fontWeight: 800,
                  }}
                >
                  {sourceFrame
                    ? `${sourceFrame} DRO forecast`
                    : "DRO forecast"}
                </span>
              </div>

              <ForecastSignal
                value={formatForecastNumber(row.stops)}
                label="stops"
              />
              <ForecastSignal
                value={formatForecastNumber(row.packages)}
                label="pkgs"
              />
              <ForecastSignal
                value={formatForecastNumber(row.time_commits)}
                label="commits"
              />
              <ForecastSignal
                value={formatForecastNumber(row.miles)}
                label="miles"
              />
              <ForecastSignal
                value={formatForecastDecimal(
                  packagesPerStop,
                  1
                )}
                label="pkg/stop"
              />
              <ForecastSignal
                value={formatForecastNumber(
                  row.minutes_per_stop
                )}
                label="min/stop"
              />
            </div>
          );
        })
      )}
    </section>
  );
}
