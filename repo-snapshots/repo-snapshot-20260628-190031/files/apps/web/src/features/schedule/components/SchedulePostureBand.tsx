"use client";

import {
  deltaTone,
  type DayCounts,
  type DayKey,
} from "@/features/schedule/lib/scheduleWorkbench";

type Props = {
  headcountTotals: DayCounts;
  routeTotals: DayCounts;
  deltaTotals: DayCounts;
};

const DAY_KEYS: DayKey[] = ["s", "u", "m", "t", "w", "h", "f"];

function sumCounts(counts: DayCounts) {
  return DAY_KEYS.reduce((sum, key) => sum + counts[key], 0);
}

const TRACKS = "18% 10% 7.5% 7.5% 7.5% 7.5% 7.5% 7.5% 7.5% 10% 8%";

export default function SchedulePostureBand(props: Props) {
  const { headcountTotals, routeTotals, deltaTotals } = props;

  const driverWeekTotal = sumCounts(headcountTotals);
  const routeWeekTotal = sumCounts(routeTotals);
  const deltaWeekTotal = sumCounts(deltaTotals);

  return (
    <div
      style={{
        marginTop: 16,
        border: "1px solid #d6dfeb",
        borderRadius: 28,
        background: "#fff",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "12px 0",
          textAlign: "center",
          fontSize: 14,
          fontWeight: 800,
          color: "#17213a",
        }}
      >
        Forecast
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: TRACKS,
          padding: "0 14px 16px",
          columnGap: 0,
          rowGap: 8,
          alignItems: "center",
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "#5c6b84",
          }}
        >
          Day
        </div>

        <div />
        {DAY_KEYS.map((key) => (
          <div
            key={`day-${key}`}
            style={{
              textAlign: "center",
              fontSize: 12,
              fontWeight: 800,
              color: "#5c6b84",
            }}
          >
            {key.toUpperCase()}
          </div>
        ))}
        <div />
        <div
          style={{
            textAlign: "center",
            fontSize: 12,
            fontWeight: 700,
            color: "#5c6b84",
          }}
        >
          Weekly Totals
        </div>

        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "#5c6b84",
          }}
        >
          Drivers
        </div>

        <div />
        {DAY_KEYS.map((key) => (
          <div
            key={`drivers-${key}`}
            style={{
              textAlign: "center",
              fontSize: 18,
              fontWeight: 600,
              color: "#17213a",
            }}
          >
            {headcountTotals[key]}
          </div>
        ))}
        <div />
        <div
          style={{
            textAlign: "center",
            fontSize: 18,
            fontWeight: 600,
            color: "#17213a",
          }}
        >
          {driverWeekTotal}
        </div>

        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "#7b879c",
          }}
        >
          Routes
        </div>

        <div />
        {DAY_KEYS.map((key) => (
          <div
            key={`routes-${key}`}
            style={{
              textAlign: "center",
              fontSize: 15,
              fontWeight: 500,
              color: "#7b879c",
            }}
          >
            {routeTotals[key]}
          </div>
        ))}
        <div />
        <div
          style={{
            textAlign: "center",
            fontSize: 15,
            fontWeight: 500,
            color: "#7b879c",
          }}
        >
          {routeWeekTotal}
        </div>

        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "#5c6b84",
          }}
        >
          Deltas
        </div>

        <div />
        {DAY_KEYS.map((key) => {
          const tone = deltaTone(deltaTotals[key], routeTotals[key]);

          return (
            <div key={`delta-${key}`} style={{ textAlign: "center" }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minWidth: 38,
                  height: 20,
                  padding: "0 10px",
                  borderRadius: 999,
                  border: `1px solid ${String(tone.border)}`,
                  background: String(tone.background),
                  color: String(tone.color),
                  fontSize: 11,
                  fontWeight: 800,
                }}
              >
                {deltaTotals[key]}
              </span>
            </div>
          );
        })}
        <div />
        {(() => {
          const tone = deltaTone(deltaWeekTotal, routeWeekTotal);

          return (
            <div style={{ textAlign: "center" }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minWidth: 42,
                  height: 20,
                  padding: "0 10px",
                  borderRadius: 999,
                  border: `1px solid ${String(tone.border)}`,
                  background: String(tone.background),
                  color: String(tone.color),
                  fontSize: 11,
                  fontWeight: 800,
                }}
              >
                {deltaWeekTotal}
              </span>
            </div>
          );
        })()}
      </div>
    </div>
  );
}