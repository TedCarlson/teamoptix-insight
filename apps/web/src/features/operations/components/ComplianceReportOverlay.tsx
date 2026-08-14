"use client";

import { useEffect, useMemo, useState } from "react";
import type { RosterComplianceSignal } from "@/features/compliance/lib/rosterCompliance";

type RosterResponseRow = {
  roster_member_id: string;
  full_name: string;
  worker_type?: string | null;
  job_title?: string | null;
  employment_status?: string | null;
  market_code?: string | null;
  compliance_signals?: RosterComplianceSignal[];
};

type Props = { open: boolean; slug: string; onClose: () => void };

const documentOrder: RosterComplianceSignal["documentType"][] = [
  "driver_license",
  "dot_medical",
  "qualification_certificate",
];

const cell: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid #e2e8f0",
  textAlign: "left",
  fontSize: 13,
};

function isDriver(row: RosterResponseRow) {
  return [row.worker_type, row.job_title].some((value) =>
    String(value ?? "").toLowerCase().includes("driver"),
  );
}

export default function ComplianceReportOverlay({ open, slug, onClose }: Props) {
  const [rows, setRows] = useState<RosterResponseRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !slug) return;
    let active = true;
    Promise.resolve().then(() => {
      if (!active) return;
      setLoading(true);
      setError(null);
      return fetch(`/api/company/${slug}/people/roster`, { credentials: "include", cache: "no-store" });
    })
      .then(async (response) => {
        if (!response) return;
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error ?? "Failed to load compliance report.");
        if (active) setRows(Array.isArray(data?.roster) ? data.roster : []);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : "Failed to load compliance report.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [open, slug]);

  const atRisk = useMemo(() => {
    const severityOrder = { red: 0, orange: 1, yellow: 2 };
    return rows
      .filter((row) => isDriver(row) && row.employment_status !== "Former" && row.employment_status !== "Candidate")
      .flatMap((driver) => (driver.compliance_signals ?? []).map((signal) => ({ driver, signal })))
      .sort((a, b) => severityOrder[a.signal.severity] - severityOrder[b.signal.severity] || a.driver.full_name.localeCompare(b.driver.full_name));
  }, [rows]);

  const documentGroups = useMemo(
    () => documentOrder
      .map((documentType) => ({
        documentType,
        label: atRisk.find(({ signal }) => signal.documentType === documentType)?.signal.label ?? documentType,
        rows: atRisk.filter(({ signal }) => signal.documentType === documentType),
      }))
      .filter((group) => group.rows.length > 0),
    [atRisk],
  );

  if (!open) return null;

  return (
    <div role="dialog" aria-modal="true" aria-label="Compliance Report" onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(2,6,23,.62)", display: "grid", placeItems: "center", padding: 16 }}>
      <section className="operations-dialog-surface" onClick={(event) => event.stopPropagation()} style={{ width: "min(900px, 100%)", maxHeight: "90vh", overflow: "auto", background: "#f8fafc", borderRadius: 20, padding: 18, boxShadow: "0 30px 90px rgba(2,6,23,.38)" }}>
        <header style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <p className="workspace-eyebrow">Operations · Compliance Report</p>
            <h2 style={{ margin: 0 }}>At-risk drivers</h2>
          </div>
          <button type="button" className="button" onClick={onClose}>Close</button>
        </header>

        {loading ? <p className="muted">Loading compliance report…</p> : null}
        {error ? <p style={{ color: "#b42318", fontWeight: 800 }}>{error}</p> : null}
        {!loading && !error && atRisk.length === 0 ? <p className="muted">No drivers currently have compliance items at risk.</p> : null}
        {documentGroups.length > 0 ? (
          <div style={{ display: "grid", gap: 18 }}>
            {documentGroups.map((group) => (
              <section key={group.documentType}>
                <h3 style={{ margin: "0 0 6px", fontSize: 15 }}>
                  {group.label} <span style={{ color: "#64748b", fontWeight: 700 }}>({group.rows.length})</span>
                </h3>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
                    <thead><tr>{["Driver", "Market", "Status", "Expiration", "Days"].map((label) => <th key={label} style={{ ...cell, color: "#64748b", fontSize: 11, textTransform: "uppercase" }}>{label}</th>)}</tr></thead>
                    <tbody>{group.rows.map(({ driver, signal }) => (
                      <tr key={driver.roster_member_id}>
                        <td style={cell}><strong>{driver.full_name}</strong></td>
                        <td style={cell}>{driver.market_code ?? "—"}</td>
                        <td style={{ ...cell, color: signal.severity === "red" ? "#b42318" : signal.severity === "orange" ? "#b54708" : "#946200", fontWeight: 800 }}>{signal.status === "urgent" || signal.status === "warning" ? "Expiring" : signal.status[0].toUpperCase() + signal.status.slice(1)}</td>
                        <td style={cell}>{signal.expirationDate ?? "—"}</td>
                        <td style={cell}>{signal.daysRemaining ?? "—"}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
