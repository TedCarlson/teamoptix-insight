"use client";

import { useEffect, useMemo, useState } from "react";
import { isoDateOffset } from "@/features/dispatch/lib/dispatchDates";

type Props = {
  slug: string;
};

type DroRow = Record<string, any>;
type DswRow = {
  route_name?: string | null;
  wa_number?: string | null;
  driver_name?: string | null;
  normalized_row_json?: Record<string, any> | null;
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function n(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function fmt(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function EvidenceCard(props: { label: string; value: string; detail: string }) {
  return (
    <section className="app-card" style={{ padding: 14 }}>
      <p className="value-card__eyebrow" style={{ marginBottom: 6 }}>{props.label}</p>
      <strong style={{ display: "block", fontSize: 26, lineHeight: 1 }}>{props.value}</strong>
      <span style={{ display: "block", marginTop: 8, color: "#64748b", fontSize: 12, fontWeight: 800 }}>
        {props.detail}
      </span>
    </section>
  );
}

export default function OperationsIntelligencePage({ slug }: Props) {
  const [droRows, setDroRows] = useState<DroRow[]>([]);
  const [dswRows, setDswRows] = useState<DswRow[]>([]);
  const [droFrame, setDroFrame] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const serviceDate = todayIso();
  const droPlanDate = isoDateOffset(serviceDate, -1);

  useEffect(() => {
    let active = true;

    async function loadEvidence() {
      setError(null);

      const [droRes, dswRes] = await Promise.all([
        fetch(`/api/company/${slug}/operations/reports/dro-plan?date=${droPlanDate}`, {
          credentials: "include",
          cache: "no-store",
        }),
        fetch(`/api/company/${slug}/operations/reports/dsw-current?date=${serviceDate}`, {
          credentials: "include",
          cache: "no-store",
        }),
      ]);

      const dro = await droRes.json().catch(() => ({}));
      const dsw = await dswRes.json().catch(() => ({}));

      if (!active) return;

      if (!droRes.ok || !dswRes.ok) {
        setError(dro?.error ?? dsw?.error ?? "Failed to load operations evidence.");
        setDroRows([]);
        setDswRows([]);
        return;
      }

      setDroRows(Array.isArray(dro?.rows) ? dro.rows : []);
      setDswRows(Array.isArray(dsw?.rows) ? dsw.rows : []);
      setDroFrame(dro?.source_frame ?? null);
    }

    void loadEvidence();

    return () => {
      active = false;
    };
  }, [droPlanDate, serviceDate, slug]);

  const summary = useMemo(() => {
    const droRoutes = droRows.length;
    const dswRoutes = dswRows.length;

    const projectedStops = droRows.reduce(
      (sum, row) => sum + n(row.total_stops ?? row.stops ?? row.planned_stops),
      0
    );
    const projectedPackages = droRows.reduce(
      (sum, row) => sum + n(row.total_packages ?? row.packages ?? row.planned_packages),
      0
    );

    const returnedRows = dswRows.filter((row) => {
      const json = row.normalized_row_json ?? {};
      return json.miles != null && json.on_road_hours != null && json.on_duty_hours != null;
    });

    const dutyHours = dswRows.reduce((sum, row) => sum + n(row.normalized_row_json?.on_duty_hours), 0);

    return {
      droRoutes,
      dswRoutes,
      projectedStops,
      projectedPackages,
      returnedRoutes: returnedRows.length,
      dutyHours,
    };
  }, [droRows, dswRows]);

  return (
    <main className="workspace-shell">
      <section className="workspace-main" style={{ paddingTop: 8, display: "grid", gap: 14 }}>
        <section className="app-card" style={{ display: "grid", gap: 6 }}>
          <p className="value-card__eyebrow">Operations Intelligence</p>
          <h1 className="workspace-title">Overview</h1>
          <p className="workspace-subtitle">
            Evidence-first operating context from DRO projection and DSW execution signals.
          </p>
        </section>

        {error ? (
          <section className="app-card" style={{ color: "#991b1b", fontWeight: 900 }}>
            {error}
          </section>
        ) : null}

        <section style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
          <EvidenceCard label="DRO Routes" value={fmt(summary.droRoutes)} detail={`${droFrame ?? "Latest"} projection · ${droPlanDate}`} />
          <EvidenceCard label="Projected Stops" value={fmt(summary.projectedStops)} detail="DRO projected route workload" />
          <EvidenceCard label="DSW Routes" value={fmt(summary.dswRoutes)} detail={`Current execution · ${serviceDate}`} />
          <EvidenceCard label="Returned Routes" value={fmt(summary.returnedRoutes)} detail={`${fmt(summary.dutyHours)} total duty hours captured`} />
        </section>

        <section className="app-card" style={{ display: "grid", gap: 8 }}>
          <p className="value-card__eyebrow">Next</p>
          <strong>Route evidence table</strong>
          <span style={{ color: "#64748b", fontSize: 13, fontWeight: 800 }}>
            Next slice pairs DRO projection with DSW execution by route so Operations Intelligence can compare expected workload to actual route conditions.
          </span>
        </section>
      </section>
    </main>
  );
}
