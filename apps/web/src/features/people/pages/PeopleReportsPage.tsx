"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { usePeopleWorkspaceRoster } from "@/features/people/hooks/usePeopleWorkspaceRoster";

type ReportKey = "workforce_readiness" | "candidate_conversion" | "workforce_roster" | "compliance_expirations" | "staffing_movement";
type ReportRow = Record<string, string | number>;
type PipelineCandidate = {
  id: string;
  full_name: string;
  role: string;
  market: string;
  hire_date: string | null;
  stage_key: string;
  stage_label: string;
  onboarding_completed_at: string | null;
  stage_is_terminal?: boolean;
  progress?: { required_total: number; required_complete: number; percent: number } | null;
};
type LifecycleFunnel = {
  introduced: number;
  checkpoints: Array<{ key: string; label: string; reached: number; observed: number; inferred: number; lifecycle_conversion: number; step_conversion: number }>;
  failures: Array<{ label: string; count: number; reasons: Record<string, number> }>;
};

const reportLabels: Record<ReportKey, string> = {
  workforce_readiness: "Workforce readiness",
  candidate_conversion: "Candidate lifecycle conversion",
  workforce_roster: "Workforce roster",
  compliance_expirations: "Compliance expirations",
  staffing_movement: "Staffing movement",
};

function addDays(days: number, asOfMs: number) {
  const date = new Date(asOfMs);
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

function activationEstimate(candidate: PipelineCandidate, asOfMs: number) {
  const planned = candidate.hire_date ? new Date(`${candidate.hire_date.slice(0, 10)}T12:00:00`) : null;
  if (planned && Number.isFinite(planned.getTime()) && planned.getTime() >= asOfMs) {
    const days = Math.max(0, Math.ceil((planned.getTime() - asOfMs) / 86_400_000));
    return { timing: `${days} day${days === 1 ? "" : "s"}`, basis: `Planned activation · ${displayDate(candidate.hire_date)}`, minDays: days, maxDays: days };
  }

  const progress = candidate.progress?.percent ?? 0;
  let range: [number, number] = [28, 56];
  if (candidate.stage_key === "ready_for_activation" || candidate.onboarding_completed_at || progress >= 100) range = [0, 7];
  else if (candidate.stage_key === "onboarding" && progress >= 80) range = [7, 14];
  else if (candidate.stage_key === "onboarding" && progress >= 50) range = [14, 28];
  else if (candidate.stage_key === "onboarding") range = [21, 42];
  else if (candidate.stage_key === "invited") range = [21, 42];
  return { timing: `${range[0]}–${range[1]} days`, basis: `${candidate.stage_label} · ${progress}% checklist complete · est. ${addDays(range[0], asOfMs)}–${addDays(range[1], asOfMs)}`, minDays: range[0], maxDays: range[1] };
}

function displayDate(value: string | null | undefined) {
  if (!value || value === "—") return "—";
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(parsed);
}

function csvValue(value: string | number) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export default function PeopleReportsPage() {
  const slug = String(useParams()?.slug ?? "");
  const { rows, loading, error } = usePeopleWorkspaceRoster(slug);
  const [report, setReport] = useState<ReportKey>("workforce_readiness");
  const [search, setSearch] = useState("");
  const [employmentStatus, setEmploymentStatus] = useState("all");
  const [complianceCondition, setComplianceCondition] = useState("all");
  const [complianceDocument, setComplianceDocument] = useState("all");
  const [asOfMs] = useState(() => Date.now());
  const [candidates, setCandidates] = useState<PipelineCandidate[]>([]);
  const [funnel, setFunnel] = useState<LifecycleFunnel>({ introduced: 0, checkpoints: [], failures: [] });
  const [pipelineLoading, setPipelineLoading] = useState(true);
  const [pipelineError, setPipelineError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    let active = true;
    Promise.all([
      fetch(`/api/company/${slug}/hiring/candidates`, { credentials: "include", cache: "no-store" }),
      fetch(`/api/company/${slug}/people/reports/workforce-readiness`, { credentials: "include", cache: "no-store" }),
    ])
      .then(async ([candidateResponse, funnelResponse]) => {
        const [candidateBody, funnelBody] = await Promise.all([candidateResponse.json(), funnelResponse.json()]);
        if (!candidateResponse.ok) throw new Error(candidateBody?.error || "Unable to load recruiting pipeline.");
        if (!funnelResponse.ok) throw new Error(funnelBody?.error || "Unable to load candidate lifecycle history.");
        return { candidateBody, funnelBody };
      })
      .then(({ candidateBody, funnelBody }) => { if (active) { setCandidates(Array.isArray(candidateBody?.candidates) ? candidateBody.candidates : []); setFunnel({ introduced: Number(funnelBody?.introduced ?? 0), checkpoints: Array.isArray(funnelBody?.checkpoints) ? funnelBody.checkpoints : [], failures: Array.isArray(funnelBody?.failures) ? funnelBody.failures : [] }); } })
      .catch((cause) => { if (active) { setCandidates([]); setPipelineError(cause instanceof Error ? cause.message : "Unable to load recruiting pipeline."); } })
      .finally(() => { if (active) setPipelineLoading(false); });
    return () => { active = false; };
  }, [slug]);

  const currentPeople = useMemo(() => rows.filter((row) => row.employment_status !== "Former"), [rows]);
  const employmentStatuses = useMemo(() => Array.from(new Set(currentPeople.map((person) => person.employment_status))).sort(), [currentPeople]);
  const complianceDocumentTypes = useMemo(() => Array.from(new Set(currentPeople.flatMap((person) => (person.compliance_signals ?? []).map((signal) => signal.label)))).sort(), [currentPeople]);
  const activeHeadcount = useMemo(() => rows.filter((row) => row.employment_status === "Active").length, [rows]);
  const traineeCount = useMemo(() => rows.filter((row) => row.employment_status === "Trainee").length, [rows]);
  const activeDrivers = useMemo(() => rows.filter((row) => row.employment_status === "Active"), [rows]);
  const trainees = useMemo(() => rows.filter((row) => row.employment_status === "Trainee"), [rows]);
  const openCandidates = useMemo(() => candidates.filter((candidate) => !candidate.stage_is_terminal), [candidates]);
  const activationForecast = useMemo(() => openCandidates.map((candidate) => ({ candidate, estimate: activationEstimate(candidate, asOfMs) })), [asOfMs, openCandidates]);
  const pipelineCount = traineeCount + openCandidates.length;
  const nextDriverSeat = useMemo(() => {
    if (trainees.length) return "0–7 days";
    if (!activationForecast.length) return "—";
    const next = [...activationForecast].sort((a, b) => a.estimate.minDays - b.estimate.minDays || a.estimate.maxDays - b.estimate.maxDays)[0].estimate;
    return next.timing;
  }, [activationForecast, trainees.length]);

  const reportRows = useMemo<ReportRow[]>(() => {
    if (report === "workforce_readiness") return [
      ...activeDrivers.map((person) => ({ Person: person.full_name, "Roster position": "Driver", Role: person.worker_type || "—", Market: person.market_code || "—", Stage: "Active roster", Readiness: person.compliance_signals?.length ? `${person.compliance_signals.length} compliance item${person.compliance_signals.length === 1 ? "" : "s"}` : "Ready", "Days to driver seat": "0 days", Basis: "Current active status" })),
      ...trainees.map((person) => ({ Person: person.full_name, "Roster position": "Pipeline", Role: person.worker_type || "—", Market: person.market_code || "—", Stage: "Trainer seat", Readiness: person.compliance_signals?.length ? `${person.compliance_signals.length} compliance item${person.compliance_signals.length === 1 ? "" : "s"}` : "Final training", "Days to driver seat": "0–7 days", Basis: "Trainer seat · estimated" })),
      ...activationForecast.map(({ candidate, estimate }) => ({ Person: candidate.full_name, "Roster position": "Pipeline", Role: candidate.role || "—", Market: candidate.market || "—", Stage: candidate.stage_label, Readiness: `${candidate.progress?.percent ?? 0}%`, "Days to driver seat": estimate.timing, Basis: estimate.basis })),
    ];

    if (report === "candidate_conversion") return [
      ...funnel.checkpoints.map((checkpoint) => ({ Type: "Conversion", Milestone: checkpoint.label, Reached: checkpoint.reached, Observed: checkpoint.observed, Inferred: checkpoint.inferred, "Lifecycle conversion": `${checkpoint.lifecycle_conversion}%`, "Step conversion": `${checkpoint.step_conversion}%`, "Failure detail": "—" })),
      ...funnel.failures.map((failure) => ({ Type: "Failure", Milestone: failure.label, Reached: failure.count, Observed: "—", Inferred: "—", "Lifecycle conversion": "—", "Step conversion": "—", "Failure detail": Object.entries(failure.reasons).map(([reason, count]) => `${reason}: ${count}`).join(" · ") })),
    ];

    if (report === "workforce_roster") return rows.map((person) => ({
      Person: person.full_name,
      Status: person.employment_status,
      Role: person.worker_type || "—",
      Market: person.market_code || "—",
      Manager: person.reports_to_name || "—",
      "Hire date": displayDate(person.hire_date),
      Email: person.email || "—",
      Phone: person.phone || "—",
    }));

    if (report === "compliance_expirations") return currentPeople
      .filter((person) => employmentStatus === "all" || person.employment_status === employmentStatus)
      .flatMap((person) => (person.compliance_signals ?? [])
      .filter((signal) => complianceCondition === "all" || signal.status === complianceCondition)
      .filter((signal) => complianceDocument === "all" || signal.label === complianceDocument)
      .map((signal) => ({
      Person: person.full_name,
      Status: person.employment_status,
      Role: person.worker_type || "—",
      Document: signal.label,
      Condition: signal.status === "urgent" ? "Due within 30 days" : signal.status === "warning" ? "Due within 60 days" : signal.status === "expired" ? "Expired" : "Missing",
      Expiration: displayDate(signal.expirationDate),
      "Days remaining": signal.daysRemaining == null ? "—" : signal.daysRemaining,
    })));

    return rows
      .filter((person) => person.hire_date || person.separation_date)
      .map((person) => ({
        Person: person.full_name,
        Status: person.employment_status,
        Role: person.worker_type || "—",
        Market: person.market_code || "—",
        "Hire date": displayDate(person.hire_date),
        "Separation date": displayDate(person.separation_date),
        Tenure: person.hire_date ? `${Math.max(0, Math.floor((asOfMs - new Date(`${person.hire_date.slice(0, 10)}T00:00:00Z`).getTime()) / 86_400_000))} days` : "—",
      }));
  }, [activationForecast, activeDrivers, asOfMs, complianceCondition, complianceDocument, currentPeople, employmentStatus, funnel, report, rows, trainees]);

  const visibleRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term ? reportRows.filter((row) => Object.values(row).some((value) => String(value).toLowerCase().includes(term))) : reportRows;
  }, [reportRows, search]);
  const columns = useMemo(() => visibleRows[0] ? Object.keys(visibleRows[0]) : reportRows[0] ? Object.keys(reportRows[0]) : [], [reportRows, visibleRows]);

  function downloadCsv() {
    if (!visibleRows.length || !columns.length) return;
    const csv = [columns.map(csvValue).join(","), ...visibleRows.map((row) => columns.map((column) => csvValue(row[column])).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${slug}-${report}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return <main className="workspace-shell">
    <section className="workspace-main people-reports-workspace">
      <div className="people-workspace-toolbar people-reports-toolbar">
        <label><span>Report</span><select value={report} onChange={(event) => { setReport(event.target.value as ReportKey); setSearch(""); }}>{(Object.keys(reportLabels) as ReportKey[]).map((key) => <option key={key} value={key}>{reportLabels[key]}</option>)}</select></label>
        {report === "compliance_expirations" ? <><label><span>Status</span><select value={employmentStatus} onChange={(event) => setEmploymentStatus(event.target.value)}><option value="all">All statuses</option>{employmentStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label><label><span>Condition</span><select value={complianceCondition} onChange={(event) => setComplianceCondition(event.target.value)}><option value="all">All conditions</option><option value="missing">Missing</option><option value="expired">Expired</option><option value="urgent">Due within 30 days</option><option value="warning">Due within 60 days</option></select></label><label><span>Document</span><select value={complianceDocument} onChange={(event) => setComplianceDocument(event.target.value)}><option value="all">All document types</option>{complianceDocumentTypes.map((label) => <option key={label} value={label}>{label}</option>)}</select></label></> : null}
        <input className="people-workspace-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search this report" aria-label="Search report" />
        <button className="button button-primary" type="button" disabled={!visibleRows.length} onClick={downloadCsv}>Download CSV</button>
      </div>

      <div className="people-workspace-stats people-reports-stats" aria-label="Workforce readiness summary">
        <span><small>Drivers now</small><strong>{activeHeadcount}</strong></span>
        <span><small>In pipeline</small><strong>{pipelineCount}</strong></span>
        <span><small>Next driver seat</small><strong>{nextDriverSeat}</strong></span>
      </div>

      <section className="app-card people-data-surface">
        {error || (["workforce_readiness", "candidate_conversion"].includes(report) && pipelineError) ? <p className="people-workspace-message is-error">{error || pipelineError}</p> : loading || (["workforce_readiness", "candidate_conversion"].includes(report) && pipelineLoading) ? <p className="people-workspace-message">Preparing report…</p> : visibleRows.length === 0 ? <p className="people-workspace-message">No records match this report.</p> : <div className="people-table-scroll"><table className="people-workspace-table"><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{visibleRows.map((row, index) => <tr key={`${String(row.Person ?? row.Milestone ?? "row")}:${index}`}>{columns.map((column) => <td key={column}>{column === "Readiness" ? <span className={row[column] === "Ready" ? "report-readiness is-ready" : "report-readiness"}>{row[column]}</span> : String(row[column])}</td>)}</tr>)}</tbody></table></div>}
      </section>
    </section>
  </main>;
}
