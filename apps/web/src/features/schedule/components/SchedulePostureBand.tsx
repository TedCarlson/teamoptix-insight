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

const cellStyle: React.CSSProperties = {
  padding: "10px 10px",
  borderBottom: "1px solid #e6edf5",
  verticalAlign: "middle",
  background: "#fff",
};

const compactCellStyle: React.CSSProperties = {
  padding: "8px 2px",
  borderBottom: "1px solid #e6edf5",
  verticalAlign: "middle",
  textAlign: "center",
  background: "#fff",
};

export default function SchedulePostureBand(props: Props) {
  const { headcountTotals, routeTotals, deltaTotals } = props;

  return (
    <div
      style={{
        marginTop: 16,
        display: "grid",
        gridTemplateColumns: "18% 10% repeat(7, 7.5%) 10% 8%",
        border: "1px solid #d6dfeb",
        borderRadius: 28,
        overflow: "hidden",
        background: "#fff",
      }}
    >
      <div style={{ ...cellStyle, borderBottom: "none", fontWeight: 800 }}>
        Posture
      </div>
      <div style={{ ...cellStyle, borderBottom: "none" }} />

      {(["s", "u", "m", "t", "w", "h", "f"] as DayKey[]).map((key) => {
        const tone = deltaTone(deltaTotals[key], routeTotals[key]);

        return (
          <div
            key={key}
            style={{
              ...compactCellStyle,
              borderBottom: "none",
              paddingTop: 10,
              paddingBottom: 10,
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 800,
                color: "#5c6b84",
                marginBottom: 6,
              }}
            >
              {key.toUpperCase()}
            </div>

            <div style={{ fontSize: 10, color: "#64748b" }}>HC</div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 800,
                color: "#0f172a",
              }}
            >
              {headcountTotals[key]}
            </div>

            <div style={{ fontSize: 10, color: "#64748b", marginTop: 4 }}>
              RT
            </div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 800,
                color: "#0f172a",
              }}
            >
              {routeTotals[key]}
            </div>

            <div style={{ fontSize: 10, color: "#64748b", marginTop: 4 }}>
              Δ
            </div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: 34,
                height: 20,
                padding: "0 8px",
                borderRadius: 999,
                border: `1px solid ${String(tone.border)}`,
                background: String(tone.background),
                color: String(tone.color),
                fontSize: 11,
                fontWeight: 800,
                lineHeight: 1,
                marginTop: 2,
              }}
            >
              {deltaTotals[key]}
            </div>
          </div>
        );
      })}

      <div style={{ ...cellStyle, borderBottom: "none" }} />
      <div style={{ ...cellStyle, borderBottom: "none" }} />
    </div>
  );
}