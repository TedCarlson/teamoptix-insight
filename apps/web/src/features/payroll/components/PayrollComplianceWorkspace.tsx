"use client";

import Link from "next/link";

const outcomeMetrics = [
  ["Motor Carrier exempt", "—"],
  ["Federal OT required", "—"],
  ["Review required", "—"],
  ["Finalized weeks", "—"],
];

export default function PayrollComplianceWorkspace({ slug }: { slug: string }) {
  return (
    <section style={{ display: "grid", gap: 16 }}>
      <header>
        <p className="value-card__eyebrow">Payroll compliance</p>
        <h1 style={{ margin: "4px 0 6px", color: "#0f172a" }}>Weekly payroll impact</h1>
        <p style={{ margin: 0, color: "#475569", maxWidth: 900 }}>
          Payroll consumes finalized weekly Compliance outcomes. Vehicle evidence, GVWR verification,
          and classification remediation remain owned by Fleet.
        </p>
      </header>

      <section aria-label="Weekly compliance outcomes" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 10 }}>
        {outcomeMetrics.map(([label, value]) => (
          <article className="app-card" style={{ padding: 14 }} key={label}>
            <p className="value-card__eyebrow">{label}</p>
            <strong style={{ display: "block", fontSize: 28, marginTop: 6 }}>{value}</strong>
          </article>
        ))}
      </section>

      <article className="app-card" style={{ padding: 16, borderLeft: "4px solid #d97706" }}>
        <p className="value-card__eyebrow">Outcome warehouse</p>
        <h2 className="app-card__title" style={{ fontSize: 18 }}>No weekly determinations have been warehoused</h2>
        <p className="app-card__body" style={{ maxWidth: 920 }}>
          The database currently preserves effective-dated vehicle classification evidence, but it does not yet
          contain immutable driver-week facts or finalized Motor Carrier exempt / federal overtime required outcomes.
          Payroll calculations and exports must not infer those outcomes from L10, L15, or L20 labels.
        </p>
      </article>

      <article className="app-card" style={{ padding: 16, overflowX: "auto" }}>
        <p className="value-card__eyebrow">Weekly outcome ledger</p>
        <h2 className="app-card__title" style={{ fontSize: 18 }}>Payroll-relevant determinations</h2>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 14, minWidth: 900 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#475569", borderBottom: "1px solid #e2e8f0" }}>
              {["Workweek", "Employee", "Outcome", "Hours", "OT hours", "Regular rate", "OT premium", "Final status", "Audit"].map((heading) => (
                <th key={heading} style={{ padding: "10px 8px", fontSize: 12 }}>{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={9} style={{ padding: "22px 8px", color: "#64748b", textAlign: "center" }}>
                Weekly rows will appear only after a Compliance determination is finalized.
              </td>
            </tr>
          </tbody>
        </table>
      </article>

      <article className="app-card" style={{ padding: 16 }}>
        <p className="value-card__eyebrow">Audit and reporting</p>
        <h2 className="app-card__title" style={{ fontSize: 18 }}>Contract-year export</h2>
        <p className="app-card__body" style={{ maxWidth: 920 }}>
          The planned export groups finalized employee-workweeks into Motor Carrier exempt, federal overtime
          required, and review-required sections. Each row will carry its determination version, rule references,
          evidence manifest, payroll impact, finalizer identity, and integrity hash.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <a className="button" href="https://www.dol.gov/agencies/whd/fact-sheets/19-flsa-motor-carrier" target="_blank" rel="noreferrer">DOL Fact Sheet #19</a>
          <a className="button" href="https://www.dol.gov/agencies/whd/field-assistance-bulletins/2010-2" target="_blank" rel="noreferrer">DOL Bulletin 2010-2</a>
          <Link className="button" href={`/company/${slug}/fleet/vehicles`}>Fleet evidence</Link>
        </div>
      </article>
    </section>
  );
}
