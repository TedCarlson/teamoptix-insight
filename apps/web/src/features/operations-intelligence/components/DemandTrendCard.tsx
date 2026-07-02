type IntelligenceSummary = {
  demand?: {
    latest_service_date?: string | null;
    history_count?: number;
    signal?: string;
    latest?: { routes?: number; stops?: number; packages?: number };
    average?: { routes?: number; stops?: number; packages?: number };
    delta_pct?: { routes?: number; stops?: number; packages?: number };
  };
};

function fmt(value: number, digits = 0) {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function DemandMetric(props: { label: string; latest?: number; average?: number; delta?: number }) {
  const delta = Number(props.delta ?? 0);
  const deltaText = `${delta >= 0 ? "+" : ""}${fmt(delta, 1)}%`;

  return (
    <section style={{ border: "1px solid #edf2f7", borderRadius: 12, padding: 10 }}>
      <p style={{ margin: "0 0 6px", color: "#64748b", fontSize: 11, fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {props.label}
      </p>
      <strong style={{ display: "block", fontSize: 22, lineHeight: 1 }}>{fmt(Number(props.latest ?? 0), 0)}</strong>
      <span style={{ display: "block", marginTop: 6, color: "#64748b", fontSize: 12, fontWeight: 850 }}>
        Avg {fmt(Number(props.average ?? 0), 1)} · <span style={{ color: Math.abs(delta) >= 10 ? "#b91c1c" : Math.abs(delta) >= 5 ? "#92400e" : "#166534", fontWeight: 950 }}>{deltaText}</span>
      </span>
    </section>
  );
}

export default function DemandTrendCard({ summary }: { summary: IntelligenceSummary | null }) {
  const demand = summary?.demand;
  if (!demand) return null;

  return (
    <section style={{ border: "1px solid #d7e2f2", borderRadius: 14, background: "#fff", padding: 12, display: "grid", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12 }}>
        <div>
          <p style={{ margin: "0 0 3px", color: "#009b67", fontSize: 11, fontWeight: 950, letterSpacing: "0.12em", textTransform: "uppercase" }}>
            Demand Trend
          </p>
          <strong>Last {demand.history_count ?? 14} operating days</strong>
          <p style={{ margin: "5px 0 0", color: "#64748b", fontSize: 12, fontWeight: 850 }}>
            Latest final day: {demand.latest_service_date ?? "Pending"}
          </p>
        </div>

        <div style={{ border: "1px solid #fde68a", borderRadius: 999, background: "#fffbeb", color: "#92400e", padding: "6px 11px", fontSize: 12, fontWeight: 950, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          {demand.signal ?? "NORMAL"}
        </div>
      </div>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
        <DemandMetric label="Routes" latest={demand.latest?.routes} average={demand.average?.routes} delta={demand.delta_pct?.routes} />
        <DemandMetric label="Stops" latest={demand.latest?.stops} average={demand.average?.stops} delta={demand.delta_pct?.stops} />
        <DemandMetric label="Packages" latest={demand.latest?.packages} average={demand.average?.packages} delta={demand.delta_pct?.packages} />
      </section>
    </section>
  );
}
