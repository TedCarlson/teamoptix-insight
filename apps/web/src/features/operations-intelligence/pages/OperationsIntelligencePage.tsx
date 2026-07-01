"use client";

import { useEffect, useMemo, useState } from "react";
import { isoDateOffset } from "@/features/dispatch/lib/dispatchDates";

type Props = { slug: string };
type DroRow = Record<string, any>;
type DswRow = { normalized_row_json?: Record<string, any> | null };

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
    <section style={{
      border: "1px solid #d7e2f2",
      borderRadius: 14,
      background: "#fff",
      padding: 12,
      minHeight: 86,
      display: "grid",
      alignContent: "start",
      gap: 5,
    }}>
      <span style={{ color: "#009b67", fontSize: 11, fontWeight: 950, letterSpacing: "0.12em", textTransform: "uppercase" }}>
        {props.label}
      </span>
      <strong style={{ fontSize: 22, lineHeight: 1 }}>{props.value}</strong>
      <span style={{ color: "#64748b", fontSize: 12, fontWeight: 800 }}>{props.detail}</span>
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
        fetch(`/api/company/${slug}/operations/reports/dro-plan?date=${droPlanDate}`, { credentials: "include", cache: "no-store" }),
        fetch(`/api/company/${slug}/operations/reports/dsw-current?date=${serviceDate}`, { credentials: "include", cache: "no-store" }),
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
    return () => { active = false; };
  }, [droPlanDate, serviceDate, slug]);

  const summary = useMemo(() => {
    const returnedRoutes = dswRows.filter((row) => {
      const json = row.normalized_row_json ?? {};
      return json.miles != null && json.on_road_hours != null && json.on_duty_hours != null;
    }).length;

    return {
      droRoutes: droRows.length,
      dswRoutes: dswRows.length,
      projectedStops: droRows.reduce((sum, row) => sum + n(row.total_stops ?? row.stops ?? row.planned_stops), 0),
      dutyHours: dswRows.reduce((sum, row) => sum + n(row.normalized_row_json?.on_duty_hours), 0),
      returnedRoutes,
    };
  }, [droRows, dswRows]);

  return (
    <main className="workspace-shell">
      <section className="workspace-main" style={{ paddingTop: 8, display: "grid", gap: 10 }}>
        <header style={{
          border: "1px solid #d7e2f2",
          borderRadius: 14,
          background: "#fff",
          padding: "12px 14px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
        }}>
          <div>
            <p style={{ margin: "0 0 3px", color: "#009b67", fontSize: 11, fontWeight: 950, letterSpacing: "0.12em", textTransform: "uppercase" }}>
              Operations Intelligence
            </p>
            <h1 style={{ margin: 0, fontSize: 22, lineHeight: 1.1, letterSpacing: "-0.03em" }}>Overview</h1>
          </div>
          <p style={{ margin: 0, color: "#64748b", fontSize: 13, fontWeight: 800, maxWidth: 620 }}>
            Evidence-first context from DRO projection and DSW execution signals.
          </p>
        </header>

        {error ? (
          <section style={{ border: "1px solid #fecaca", borderRadius: 14, background: "#fef2f2", color: "#991b1b", padding: 12, fontWeight: 900 }}>
            {error}
          </section>
        ) : null}

        <section style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
          <EvidenceCard label="DRO Routes" value={fmt(summary.droRoutes)} detail={`${droFrame ?? "Latest"} projection · ${droPlanDate}`} />
          <EvidenceCard label="Projected Stops" value={fmt(summary.projectedStops)} detail="Projected workload" />
          <EvidenceCard label="DSW Routes" value={fmt(summary.dswRoutes)} detail={`Current execution · ${serviceDate}`} />
          <EvidenceCard label="Returned Routes" value={fmt(summary.returnedRoutes)} detail={`${fmt(summary.dutyHours)} duty hours captured`} />
        </section>

        <section style={{ border: "1px solid #d7e2f2", borderRadius: 14, background: "#fff", padding: 12 }}>
          <p style={{ margin: "0 0 4px", color: "#009b67", fontSize: 11, fontWeight: 950, letterSpacing: "0.12em", textTransform: "uppercase" }}>
            Evidence Queue
          </p>
          <strong>Route evidence table is next.</strong>
        </section>
      </section>
    </main>
  );
}
