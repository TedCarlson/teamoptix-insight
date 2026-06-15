"use client";

import { useEffect, useMemo, useState } from "react";
import { eyebrow, panel } from "@/features/dispatch/lib/dispatchSupport";

type SnapshotRow = {
  summary_scope: "CONTRACT" | "COLOCATION" | string;
  summary_label: string;
  contract_code: string | null;
  terminal_code: string | null;
  normalized_row_json: Record<string, unknown>;
};

type Payload = {
  source: "DSW";
  rows: SnapshotRow[];
};

type Props = {
  slug: string;
  serviceDate: string;
};

const METRICS: Array<{
  key: string;
  label: string;
  kind?: "number" | "percent";
}> = [
  { key: "vscan_packages", label: "Packages planned" },
  { key: "planned_delivery_stops", label: "Delivery stops planned" },
  { key: "planned_pickup_stops", label: "Pickup stops planned" },
  { key: "actual_delivery_packages", label: "Packages delivered" },
  { key: "actual_delivery_stops", label: "Delivery stops completed" },
  { key: "actual_pickup_stops", label: "Pickup stops completed" },
  { key: "actual_pickup_packages", label: "Pickup packages completed" },
  { key: "ils_percent", label: "ILS %", kind: "percent" },
  { key: "ils_impact_packages", label: "ILS impact packages" },
  { key: "non_delivered_stops", label: "Non-delivered stops" },
  { key: "code_85", label: "Code 85" },
  { key: "all_status_code_packages", label: "Status code packages" },
  { key: "pl_ml", label: "P'L M'L" },
  { key: "dna", label: "DNA" },
  { key: "send_again", label: "Send again" },
  { key: "exceptions", label: "Exceptions" },
  { key: "vsa_star_diff", label: "VSA vs STAR diff" },
  { key: "return_scans_percent", label: "Return scans %", kind: "percent" },
  { key: "miles", label: "Miles" },
  { key: "on_road_hours", label: "On road hours" },
  { key: "on_duty_hours", label: "On duty hours" },
  { key: "potential_dot_hours_violations", label: "Potential DOT violations" },
  { key: "potential_missed_pickups", label: "Potential missed pickups" },
  { key: "early_late_pickups", label: "Early/late pickups" },
  { key: "required_signature", label: "Required signatures" },
  // Date Certain omitted for now because DSW summary footer values are shifted.
  { key: "evening", label: "Evening" },
  { key: "appointment", label: "Appointments" },
];

function toNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatValue(value: number, kind?: "number" | "percent") {
  if (kind === "percent") return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function SnapshotStat(props: {
  label: string;
  contractValue: string;
  terminalValue: string | null;
  shareValue: string | null;
}) {
  return (
    <div
      style={{
        border: "1px solid #edf2f7",
        borderRadius: 12,
        padding: "9px 10px",
        display: "grid",
        gap: 6,
      }}
    >
      <span style={{ color: "#64748b", fontSize: 12, fontWeight: 900 }}>
        {props.label}
      </span>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: props.terminalValue ? "1fr 1fr 58px" : "1fr",
          gap: 8,
          alignItems: "end",
        }}
      >
        <div>
          <span style={{ display: "block", color: "#94a3b8", fontSize: 10, fontWeight: 900 }}>
            Contract
          </span>
          <strong>{props.contractValue}</strong>
        </div>

        {props.terminalValue ? (
          <div>
            <span style={{ display: "block", color: "#94a3b8", fontSize: 10, fontWeight: 900 }}>
              Terminal
            </span>
            <strong>{props.terminalValue}</strong>
          </div>
        ) : null}

        {props.shareValue ? (
          <div style={{ textAlign: "right" }}>
            <span style={{ display: "block", color: "#94a3b8", fontSize: 10, fontWeight: 900 }}>
              Share
            </span>
            <strong>{props.shareValue}</strong>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function ServiceSnapshotCard({ slug, serviceDate }: Props) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadSnapshot() {
      try {
        setError(null);

        const res = await fetch(
          `/api/company/${slug}/operations/reports/dsw-service-snapshot?date=${serviceDate}`,
          { credentials: "include", cache: "no-store" }
        );

        const data = await res.json();

        if (!active) return;

        if (!res.ok) {
          setPayload(null);
          setError(data?.error ?? "Failed to load service snapshot.");
          return;
        }

        setPayload(data);
      } catch (err) {
        if (!active) return;
        setPayload(null);
        setError(err instanceof Error ? err.message : "Failed to load service snapshot.");
      }
    }

    if (slug && serviceDate) void loadSnapshot();

    return () => {
      active = false;
    };
  }, [serviceDate, slug]);

  const contractRow = useMemo(
    () => payload?.rows?.find((row) => row.summary_scope === "CONTRACT") ?? null,
    [payload?.rows]
  );

  const colocationRow = useMemo(
    () => payload?.rows?.find((row) => row.summary_scope === "COLOCATION") ?? null,
    [payload?.rows]
  );

  const metrics = useMemo(() => {
    const contractJson = contractRow?.normalized_row_json ?? {};
    const terminalJson = colocationRow?.normalized_row_json ?? {};

    return METRICS.map((metric) => {
      const contractValue = toNumber(contractJson[metric.key]);
      if (contractValue === null || contractValue === 0) return null;

      const terminalValue = toNumber(terminalJson[metric.key]);
      const share =
        terminalValue && terminalValue > 0
          ? `${((contractValue / terminalValue) * 100).toFixed(1)}%`
          : null;

      return {
        key: metric.key,
        label: metric.label,
        contractValue: formatValue(contractValue, metric.kind),
        terminalValue:
          terminalValue && terminalValue > 0
            ? formatValue(terminalValue, metric.kind)
            : null,
        shareValue: share,
      };
    }).filter(Boolean) as Array<{
      key: string;
      label: string;
      contractValue: string;
      terminalValue: string | null;
      shareValue: string | null;
    }>;
  }, [colocationRow?.normalized_row_json, contractRow?.normalized_row_json]);

  return (
    <section style={{ ...panel, padding: 14, display: "grid", gap: 10 }}>
      <div>
        <p style={eyebrow}>Service Snapshot</p>
        {contractRow?.contract_code ? (
          <p style={{ margin: "2px 0 0", color: "#64748b", fontSize: 12, fontWeight: 850 }}>
            Contract {contractRow.contract_code}
          </p>
        ) : null}
        {colocationRow ? (
          <p style={{ margin: "2px 0 0", color: "#94a3b8", fontSize: 11, fontWeight: 800 }}>
            Terminal aggregate available
          </p>
        ) : null}
      </div>

      {error ? (
        <p style={{ margin: 0, color: "#991b1b", fontSize: 12, fontWeight: 800 }}>
          {error}
        </p>
      ) : null}

      {!error && metrics.length === 0 ? (
        <p style={{ margin: 0, color: "#94a3b8", fontSize: 12, fontWeight: 800 }}>
          No summary metrics loaded.
        </p>
      ) : null}

      {metrics.map((metric) => (
        <SnapshotStat
          key={metric.key}
          label={metric.label}
          contractValue={metric.contractValue}
          terminalValue={metric.terminalValue}
          shareValue={metric.shareValue}
        />
      ))}
    </section>
  );
}
