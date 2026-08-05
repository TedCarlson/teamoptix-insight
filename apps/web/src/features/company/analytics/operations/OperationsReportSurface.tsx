"use client";

import { useMemo } from "react";
import { useAnalyticsData } from "../AnalyticsDataProvider";
import CompositeOperatingChart from "../CompositeOperatingChart";
import { buildOperatingIntelligenceDataset } from "../operatingIntelligence";
import OperationsReportCalendar from "./OperationsReportCalendar";
import { buildOperationsReport, type ReportMetric } from "./operationsReport";

const metrics: Array<[ReportMetric, string]> = [["routes", "Routes operated"], ["stops", "Stops"], ["packages", "Packages"], ["stopsPerRoute", "Stops / route"], ["packagesPerRoute", "Packages / route"], ["packagesPerStop", "Packages / stop"]];
const number = (value: number, digits = 0) => new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(value);
const percent = (value: number | null) => value == null ? "—" : new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 1, signDisplay: "exceptZero" }).format(value);
const pri = (value: number | null) => value == null ? "—" : value.toFixed(3);
const shortDate = (value: string) => new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));

export default function OperationsReportSurface() {
  const { payload, payloadLoading, yearsLoading, error, loadedYear } = useAnalyticsData();
  const report = useMemo(() => buildOperationsReport(payload?.rows ?? []), [payload]);
  const intelligence = useMemo(() => buildOperatingIntelligenceDataset(payload?.rows ?? []), [payload]);

  return <main className="workspace-shell"><section className="workspace-main" style={{ paddingTop: 0, paddingBottom: 36 }}>
    <article style={{ maxWidth: 1240, margin: "0 auto", background: "#fff", border: "1px solid #dbe3ed", boxShadow: "0 18px 50px rgba(15,23,42,.06)", padding: "clamp(18px, 2.5vw, 36px)" }}>
      <header style={{ borderBottom: "3px solid #0f172a", paddingBottom: 22, display: "flex", justifyContent: "space-between", gap: 24, alignItems: "end", flexWrap: "wrap" }}>
        <div><p className="value-card__eyebrow">Analytics · Operations</p><h1 style={{ margin: "7px 0 0", fontSize: "clamp(34px, 5vw, 54px)", lineHeight: 1, letterSpacing: "-.045em" }}>Operations Report</h1><p style={{ margin: "12px 0 0", color: "#475569", maxWidth: 680, lineHeight: 1.65 }}>A contract-year reading of demand, route supply, and the workload carried by each operating plan.</p></div>
        <div style={{ textAlign: "right", color: "#475569", fontSize: 12, lineHeight: 1.7 }}><strong style={{ display: "block", color: "#0f172a", fontSize: 14 }}>Contract year {loadedYear ?? "—"}</strong><span>FINAL DSW · {report.operatingDays} operating days</span><br/><span>Current through {report.throughDate ? shortDate(report.throughDate) : "—"}</span></div>
      </header>

      {(yearsLoading || payloadLoading) ? <div style={{ padding: "60px 0", color: "#64748b" }}>Reading the persisted FINAL operating record…</div> : null}
      {error ? <div style={{ padding: "28px 0", color: "#b91c1c" }}><strong>Operations report unavailable.</strong><p>{error}</p></div> : null}
      {!payloadLoading && !error && payload && !report.operatingDays ? <div style={{ padding: "50px 0" }}><strong>No FINAL operating history is available for this contract year.</strong></div> : null}

      {!payloadLoading && report.operatingDays > 0 ? <>
        <section style={{ padding: "30px 0 26px" }}><p className="value-card__eyebrow">Current operating position</p><div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.55fr) minmax(230px, .7fr)", gap: 30, marginTop: 10 }}><div>{report.narrative.map((paragraph) => <p key={paragraph} style={{ margin: "0 0 12px", fontFamily: "Georgia, serif", fontSize: 20, lineHeight: 1.55, color: "#1e293b" }}>{paragraph}</p>)}</div><aside style={{ borderLeft: "1px solid #cbd5e1", paddingLeft: 20 }}><strong style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: ".08em" }}>How to read this report</strong><p className="app-card__body" style={{ marginTop: 8 }}>Each rolling window is compared with the immediately preceding window of equal length. Contract trend compares its latter half with its first half.</p></aside></div></section>

        <section style={{ borderTop: "1px solid #cbd5e1", padding: "26px 0" }}><p className="value-card__eyebrow">30 / 60 / 90 / Contract</p><h2 style={{ margin: "5px 0 14px", fontSize: 28 }}>Demand and operating-plan comparison</h2><div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}><thead><tr><th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "2px solid #0f172a" }}>Measure</th>{report.periods.map((period) => <th key={period.key} style={{ textAlign: "right", padding: "10px 8px", borderBottom: "2px solid #0f172a" }}>{period.label}<small style={{ display: "block", color: "#64748b", fontWeight: 500 }}>{period.days} operating days</small></th>)}</tr></thead><tbody>{metrics.map(([key, label]) => <tr key={key}><th style={{ textAlign: "left", padding: "13px 8px", borderBottom: "1px solid #e2e8f0", fontSize: 13 }}>{label}</th>{report.periods.map((period) => <td key={period.key} style={{ textAlign: "right", padding: "13px 8px", borderBottom: "1px solid #e2e8f0" }}><strong>{number(period.metrics[key], key.includes("Per") ? 1 : 0)}</strong><small style={{ display: "block", color: (period.change[key] ?? 0) > 0 ? "#166534" : (period.change[key] ?? 0) < 0 ? "#b91c1c" : "#64748b" }}>{percent(period.change[key])}</small></td>)}</tr>)}</tbody></table></div></section>

        <CompositeOperatingChart days={intelligence.days} weeks={intelligence.weeks} overlays={intelligence.overlays} />

        <OperationsReportCalendar
          days={intelligence.days}
          overlays={intelligence.overlays}
          startDate={payload?.metadata.start_date ?? intelligence.days[0]?.serviceDate ?? ""}
          endDate={payload?.metadata.end_date ?? intelligence.days.at(-1)?.serviceDate ?? ""}
          throughDate={payload?.metadata.through_service_date}
          contractYear={loadedYear}
          reportWeeks={report.weeks}
        />

        <section style={{ paddingTop: 28 }}>
          <p className="value-card__eyebrow">Weekly operating ledger</p>
          <h2 style={{ margin: "5px 0 14px", fontSize: 28 }}>Chronological operating record</h2>
          <div style={{ width: "100%" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "auto", fontVariantNumeric: "tabular-nums" }}>
              <thead style={{ background: "#fff" }}>
                <tr>
                  {["Week ending", "Days", "Routes", "Stops", "Packages", "PU stops", "Early", "Late", "Potential", "Weekly PRI", "Running PRI", "Tier", "WoW"].map((label) => <th key={label} style={{ textAlign: label === "Week ending" ? "left" : "right", padding: "10px 5px", borderBottom: "2px solid #0f172a", fontSize: 11, lineHeight: 1.15, whiteSpace: "nowrap", textTransform: "uppercase", letterSpacing: ".025em" }}>{label}</th>)}
                </tr>
              </thead>
              <tbody>
                {report.weeks.map((week) => <tr key={week.weekStart}>
                  <td style={{ padding: "11px 5px", borderBottom: "1px solid #e2e8f0", fontSize: 14, fontWeight: 700, whiteSpace: "nowrap" }}>
                    <span>{shortDate(week.weekEnd)}</span>
                    {week.isInProgress ? <small style={{ display: "block", marginTop: 2, color: "#8a5b08", fontSize: 9, fontWeight: 800, letterSpacing: ".03em", textTransform: "uppercase" }}>In progress</small> : null}
                  </td>
                  {[number(week.operatingDays), number(week.routes), number(week.stops), number(week.packages), number(week.pickupStops), number(week.earlyPickups), number(week.latePickups), number(week.potentialMissedPickups), pri(week.weeklyPri), pri(week.runningPri), week.runningTier ?? "—", percent(week.stopsChange)].map((value, index) => <td key={index} style={{ padding: "11px 5px", borderBottom: "1px solid #e2e8f0", textAlign: "right", whiteSpace: "nowrap", fontSize: 14, color: index === 11 && week.stopsChange != null ? week.stopsChange >= 0 ? "#166534" : "#b91c1c" : "#334155" }}>{value}</td>)}
                </tr>)}
              </tbody>
            </table>
          </div>
        </section>

        <footer style={{ borderTop: "1px solid #cbd5e1", marginTop: 30, paddingTop: 16, color: "#64748b", fontSize: 11 }}>Source: persisted FINAL DSW contract-year history through {report.throughDate}. Rolling comparisons use operating records within each calendar window; no additional fetch, inferred route detail, or independent date scope is introduced.</footer>
      </> : null}
    </article>
  </section></main>;
}
