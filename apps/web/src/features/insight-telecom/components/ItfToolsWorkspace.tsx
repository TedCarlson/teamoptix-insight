"use client";

import { useMemo, useState } from "react";
import type { ItfWorkforceUnitOption } from "../roster/itfRosterForm";
import {
  inspectFuseOnboardingRows,
  type FuseCellValue,
  type FuseOnboardingInspection,
  type FuseOnboardingRejection,
} from "../tools/fuseOnboardingImport";
import ItfWorkspaceSurface from "./ItfWorkspaceSurface";
import styles from "./ItfToolsWorkspace.module.css";

const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const MAX_SOURCE_ROWS = 5_000;

type InspectionResult = FuseOnboardingInspection | FuseOnboardingRejection;

type SourceMeta = {
  name: string;
  size: number;
  sha256: string;
};

type ReconciliationRow = {
  id: string;
  rowNumber: number;
  candidate: string;
  company: string;
  resolvedCompanyId: string | null;
  suggestedCompanyId: string | null;
  suggestedCompanyName: string | null;
  locationCode: string | null;
  fuseStatus: string | null;
  techId: string | null;
  fusePersonnelId: string | null;
  matchedRosterId: string | null;
  matchedCandidateId: string | null;
  action: "insert" | "version" | "unchanged" | "ignore" | "review" | "stale";
  reason: string;
  decision: "pending" | "approved" | "ignored" | "applied";
  appliedVersionId: string | null;
  localDisposition: "active" | "inactive" | "filed" | null;
};

type ReconciliationResult = {
  batchId: string;
  status: "reconciled" | "partially_applied" | "applied";
  filename: string;
  createdAt: string;
  appliedAt: string | null;
  counts: {
    total: number;
    changes: number;
    review: number;
    unchanged: number;
    ignored: number;
    applied: number;
  };
  rows: ReconciliationRow[];
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

async function sha256(bytes: Uint8Array) {
  const copy = Uint8Array.from(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy.buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function rowReviewLabel(row: FuseOnboardingInspection["rows"][number]) {
  const errorCount = row.issues.filter((issue) => issue.severity === "error").length;
  if (errorCount) return `${errorCount} blocking`;
  if (row.issues.length) return `${row.issues.length} review`;
  return "Ready";
}

function sourceActionLabel(action: FuseOnboardingInspection["rows"][number]["normalized"]["sourceAction"]) {
  if (action === "insert_or_update") return "Insert / update";
  if (action === "update_existing_only") return "Update only";
  return "Ignore";
}

export default function ItfToolsWorkspace({
  companySlug,
  templateHref,
  workforceUnits,
}: {
  companySlug: string;
  templateHref: string;
  workforceUnits: ItfWorkforceUnitOption[];
}) {
  const [inspection, setInspection] = useState<InspectionResult | null>(null);
  const [sourceMeta, setSourceMeta] = useState<SourceMeta | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reconciliationBusy, setReconciliationBusy] = useState(false);
  const [reconciliation, setReconciliation] = useState<ReconciliationResult | null>(null);
  const [approvedRows, setApprovedRows] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState("");
  const [inputKey, setInputKey] = useState(0);

  const reviewRows = useMemo(
    () => inspection?.recognized
      ? inspection.rows.filter((row) => row.issues.length > 0)
      : [],
    [inspection]
  );

  const decisionRows = useMemo(
    () => reconciliation?.rows.filter((row) =>
      row.action === "insert" || row.action === "version" || row.action === "review"
    ) ?? [],
    [reconciliation]
  );

  function clearSource() {
    setInspection(null);
    setSourceMeta(null);
    setReconciliation(null);
    setApprovedRows(new Set());
    setNotice("");
    setError("");
    setInputKey((value) => value + 1);
  }

  async function inspectFile(file: File | null) {
    if (!file) return clearSource();
    setBusy(true);
    setError("");
    setInspection(null);
    setSourceMeta(null);
    setReconciliation(null);
    setApprovedRows(new Set());
    setNotice("");

    try {
      if (file.size > MAX_SOURCE_BYTES) {
        throw new Error("Source files are limited to 10 MB for browser inspection.");
      }

      const XLSX = await import("xlsx");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const workbook = XLSX.read(bytes, { type: "array", cellDates: true });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) throw new Error("No worksheet was found in this source file.");
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<FuseCellValue[]>(sheet, {
        header: 1,
        defval: null,
        raw: true,
      });
      if (!rows.length) throw new Error("The first worksheet is empty.");
      if (rows.length - 1 > MAX_SOURCE_ROWS) {
        throw new Error(`Source inspection is limited to ${MAX_SOURCE_ROWS.toLocaleString()} rows.`);
      }

      const [fingerprint] = await Promise.all([sha256(bytes)]);
      setSourceMeta({ name: file.name, size: file.size, sha256: fingerprint });
      setInspection(inspectFuseOnboardingRows(rows, { sheetName, workforceUnits }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The source file could not be inspected.");
    } finally {
      setBusy(false);
    }
  }

  async function compareWithCurrentRecords() {
    if (!sourceMeta || !inspection?.recognized) return;
    setReconciliationBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/insight/telecom-fulfillment/${encodeURIComponent(companySlug)}/onboarding-ingestion`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "compare",
            source: {
              filename: sourceMeta.name,
              sizeBytes: sourceMeta.size,
              sha256: sourceMeta.sha256,
              sheetName: inspection.sheetName,
              headerRow: inspection.headerRow,
            },
            rows: inspection.rows,
          }),
        }
      );
      const payload = await response.json() as { result?: ReconciliationResult; error?: string };
      if (!response.ok || !payload.result) throw new Error(payload.error ?? "The source could not be compared.");
      setReconciliation(payload.result);
      setApprovedRows(new Set(payload.result.rows
        .filter((row) => row.action === "insert" || row.action === "version")
        .map((row) => row.id)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The source could not be compared.");
    } finally {
      setReconciliationBusy(false);
    }
  }

  async function applyApprovedChanges() {
    if (!reconciliation) return;
    setReconciliationBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/insight/telecom-fulfillment/${encodeURIComponent(companySlug)}/onboarding-ingestion`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "apply",
            batchId: reconciliation.batchId,
            approvedRowIds: Array.from(approvedRows),
          }),
        }
      );
      const payload = await response.json() as { result?: ReconciliationResult; error?: string };
      if (!response.ok || !payload.result) throw new Error(payload.error ?? "The approved changes could not be applied.");
      setReconciliation(payload.result);
      setApprovedRows(new Set());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The approved changes could not be applied.");
    } finally {
      setReconciliationBusy(false);
    }
  }

  async function addCompanyFromReview(row: ReconciliationRow) {
    if (!reconciliation) return;
    setReconciliationBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `/api/insight/telecom-fulfillment/${encodeURIComponent(companySlug)}/onboarding-ingestion`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "add-company",
            batchId: reconciliation.batchId,
            sourceCompanyName: row.company,
            targetCompanyId: row.suggestedCompanyId,
          }),
        }
      );
      const payload = await response.json() as { result?: ReconciliationResult; error?: string };
      if (!response.ok || !payload.result) throw new Error(payload.error ?? "The company could not be added.");
      setReconciliation(payload.result);
      setApprovedRows(new Set(payload.result.rows
        .filter((candidate) => candidate.action === "insert" || candidate.action === "version")
        .map((candidate) => candidate.id)));
      setNotice(row.suggestedCompanyName
        ? `${row.company} is now linked to ${row.suggestedCompanyName}. Every matching batch row was reconciled.`
        : `${row.company} was added to the ITF company catalogue for its source location.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The company could not be added.");
    } finally {
      setReconciliationBusy(false);
    }
  }

  return (
    <ItfWorkspaceSurface
      title="Tools"
      description="Downloads and source inspection for governed Telecom Fulfillment work."
    >
      <section className={styles.section}>
        <header className={styles.sectionHeader}>
          <div>
            <h2>Roster template</h2>
            <span>Commercial ITF workbook</span>
          </div>
          <a className="button" href={templateHref} download>
            Download template
          </a>
        </header>
        <p className={styles.sectionNote}>
          Instructions and field definitions are on the first tab. Prepared roster rows belong on the second tab.
        </p>
      </section>

      <section className={styles.section}>
        <header className={styles.sectionHeader}>
          <div>
            <h2>Source ingestion</h2>
            <span>FUSE onboarding recognition</span>
          </div>
          {sourceMeta ? <button className="button" type="button" onClick={clearSource}>Clear source</button> : null}
        </header>

        <div className={styles.safeRail}>
          <strong>{reconciliation ? "Source warehoused" : "Local inspection"}</strong>
          <span>{reconciliation
            ? "The original source rows are retained. Only approved onboarding versions are applied."
            : "Nothing is sent to the warehouse until you choose Compare with current records."}</span>
        </div>

        <div className={styles.ingestionBody}>
          <label
            className={styles.dropZone}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              void inspectFile(event.dataTransfer.files?.[0] ?? null);
            }}
          >
            <strong>{busy ? "Inspecting source…" : sourceMeta?.name ?? "Choose or drop a FUSE onboarding report"}</strong>
            <span>{sourceMeta ? `${formatBytes(sourceMeta.size)} · SHA-256 ${sourceMeta.sha256.slice(0, 16)}…` : "XLSX, XLS, or CSV · 10 MB maximum"}</span>
            <input
              key={inputKey}
              type="file"
              accept=".xlsx,.xls,.csv"
              disabled={busy}
              onChange={(event) => void inspectFile(event.target.files?.[0] ?? null)}
            />
          </label>

          {error ? <p className={styles.error} role="alert">{error}</p> : null}
          {notice ? <p className={styles.notice} role="status">{notice}</p> : null}

          {inspection && !inspection.recognized ? (
            <section className={styles.rejection}>
              <strong>Source not recognized</strong>
              <span>{inspection.reason}</span>
              <small>Missing: {inspection.missingHeaders.join(" · ") || "No governed columns identified"}</small>
            </section>
          ) : null}

          {inspection?.recognized ? (
            <>
              <section className={styles.resultRail}>
                <div><strong>FUSE onboarding</strong><span>Recognized by the governed 13-column structure</span></div>
                <dl>
                  <div><dt>Rows</dt><dd>{inspection.counts.total}</dd></div>
                  <div><dt>Ready</dt><dd>{inspection.counts.ready}</dd></div>
                  <div><dt>Review</dt><dd>{inspection.counts.review}</dd></div>
                  <div><dt>Blocking</dt><dd>{inspection.counts.invalid}</dd></div>
                </dl>
              </section>

              <section className={styles.mapping}>
                <strong>Normalized allocation</strong>
                <div>
                  <span>First + Last → person identity</span>
                  <span>Date → FUSE processing start date</span>
                  <span>Tech ID → telecom Tech ID</span>
                  <span>Personnel ID → FUSE employee ID</span>
                  <span>Company Name → company relationship key</span>
                  <span>Office → location + regional identifier</span>
                  <span>Contractor Type → Technician</span>
                  <span>Status → insert/update/ignore policy</span>
                  <span>Note + status updates → status history</span>
                  <span>Office Address → disregarded</span>
                </div>
                <small>Person status remains Onboarding. Exact insert or update is decided only after company-scoped identity reconciliation; stale status snapshots cannot replace newer ones.</small>
              </section>

              <section className={styles.actionPanel}>
                {!reconciliation ? (
                  <>
                    <div>
                      <strong>Ready to compare</strong>
                      <span>Warehouse the source rows and reconcile them against governed companies, identifiers, current onboarding versions, and roster rows.</span>
                    </div>
                    <button className="button button-primary" type="button" disabled={reconciliationBusy} onClick={() => void compareWithCurrentRecords()}>
                      {reconciliationBusy ? "Comparing…" : "Compare with current records"}
                    </button>
                  </>
                ) : (
                  <>
                    <div>
                      <strong>{reconciliation.status === "applied" ? "Import receipt" : "Action review"}</strong>
                      <span>
                        {reconciliation.counts.changes} proposed changes · {reconciliation.counts.review} exceptions · {reconciliation.counts.unchanged} no-change rows · {reconciliation.counts.ignored} ignored
                      </span>
                    </div>
                    {reconciliation.status !== "applied" ? (
                      <button
                        className="button button-primary"
                        type="button"
                        disabled={reconciliationBusy || approvedRows.size === 0}
                        onClick={() => void applyApprovedChanges()}
                      >
                        {reconciliationBusy ? "Applying…" : `Apply ${approvedRows.size} approved`}
                      </button>
                    ) : <strong className={styles.receipt}>{reconciliation.counts.applied} applied</strong>}
                  </>
                )}
              </section>

              {reconciliation ? (
                <section className={styles.preview}>
                  <header>
                    <div>
                      <strong>Proposed edits and exceptions</strong>
                      <span>{decisionRows.length} rows need attention; clean no-change rows are hidden.</span>
                    </div>
                    <small>Batch {reconciliation.batchId.slice(0, 8)}</small>
                  </header>
                  <div className={styles.tableWrap}>
                    <table className={styles.decisionTable}>
                      <thead><tr><th>Approve</th><th>Row</th><th>Candidate</th><th>Company</th><th>FUSE status</th><th>Match</th><th>Proposed action</th></tr></thead>
                      <tbody>
                        {decisionRows.map((row) => {
                          const actionable = row.action === "insert" || row.action === "version";
                          return (
                            <tr key={row.id}>
                              <td>
                                {actionable && reconciliation.status !== "applied" ? (
                                  <input
                                    type="checkbox"
                                    checked={approvedRows.has(row.id)}
                                    aria-label={`Approve ${row.candidate}`}
                                    onChange={(event) => setApprovedRows((current) => {
                                      const next = new Set(current);
                                      if (event.target.checked) next.add(row.id); else next.delete(row.id);
                                      return next;
                                    })}
                                  />
                                ) : row.decision === "applied" ? "Applied" : "Review"}
                              </td>
                              <td>{row.rowNumber}</td>
                              <td><strong>{row.candidate}</strong><span>{row.techId || row.fusePersonnelId || "No issued identifier"}</span></td>
                              <td>{row.company}</td>
                              <td>{row.fuseStatus || "—"}</td>
                              <td>
                                {row.matchedRosterId
                                  ? "Roster connected"
                                  : row.resolvedCompanyId
                                    ? "Company resolved"
                                    : row.suggestedCompanyName
                                      ? <><span>Near match</span><small>{row.suggestedCompanyName}</small></>
                                      : "Unresolved"}
                                {!row.resolvedCompanyId && row.action === "review" ? (
                                  <button
                                    className={styles.addCompany}
                                    type="button"
                                    disabled={reconciliationBusy}
                                    onClick={() => void addCompanyFromReview(row)}
                                  >
                                    {reconciliationBusy
                                      ? "Working…"
                                      : row.suggestedCompanyName
                                        ? "Link existing"
                                        : `Add company${row.locationCode ? ` · ${row.locationCode}` : ""}`}
                                  </button>
                                ) : null}
                              </td>
                              <td><span className={row.action === "review" ? styles.review : styles.ready}>{row.action}</span><small>{row.reason}</small></td>
                            </tr>
                          );
                        })}
                        {decisionRows.length === 0 ? <tr><td colSpan={7}>No edits or exceptions remain in this source.</td></tr> : null}
                      </tbody>
                    </table>
                  </div>
                </section>
              ) : null}

              <section className={styles.preview}>
                <header>
                  <div><strong>Source detail</strong><span>{reviewRows.length} rows failed local source validation</span></div>
                  <small>{inspection.sheetName} · header row {inspection.headerRow}</small>
                </header>
                <div className={styles.tableWrap}>
                  <table>
                    <thead>
                      <tr>
                        <th>Row</th>
                        <th>Candidate</th>
                        <th>FUSE status</th>
                        <th>Action</th>
                        <th>Company</th>
                        <th>Location / region</th>
                        <th>Tech ID</th>
                        <th>FUSE ID</th>
                        <th>Status evidence</th>
                        <th>Review</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inspection.rows.map((row) => (
                        <tr key={row.rowNumber}>
                          <td>{row.rowNumber}</td>
                          <td><strong>{row.normalized.fullName || "Missing name"}</strong><span>Start {row.normalized.startDate ?? "invalid"}</span></td>
                          <td>{row.normalized.fuseStatus || "—"}</td>
                          <td>{sourceActionLabel(row.normalized.sourceAction)}</td>
                          <td>{row.normalized.companyName || "—"}</td>
                          <td><strong>{row.normalized.locationCode || "—"} · {row.normalized.locationName}</strong><span>{row.normalized.regionalIdentifier || "No regional identifier"}</span></td>
                          <td className={styles.identifier}>{row.normalized.techId || "—"}</td>
                          <td className={styles.identifier}>{row.normalized.fuseEmployeeId || "—"}</td>
                          <td>{row.normalized.statusEffectiveAt ?? "—"}{row.normalized.sourceSnapshotCount > 1 ? <span>{row.normalized.sourceSnapshotCount} source snapshots</span> : null}</td>
                          <td>
                            <span className={row.issues.some((issue) => issue.severity === "error") ? styles.blocked : row.issues.length ? styles.review : styles.ready}>
                              {rowReviewLabel(row)}
                            </span>
                            {row.issues.length ? <small title={row.issues.map((issue) => issue.message).join("\n")}>{row.issues[0].message}</small> : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          ) : null}
        </div>
      </section>
    </ItfWorkspaceSurface>
  );
}
