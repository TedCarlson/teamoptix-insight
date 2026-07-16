"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useLob } from "@/features/lob/hooks/useLob";

type ParsedRow = {
  row_number: number;
  roster_member_id: string;
  full_name: string;
  email: string;
  phone: string;
  date_of_birth: string;
  fx_id: string;
  role: string;
  worker_type: string;
  license_number: string;
  issuing_state: string;
  license_issue_date: string;
  license_expiration_date: string;
  address_line_1: string;
  address_line_2: string;
  city: string;
  state_region: string;
  postal_code: string;
  hire_date: string;
  start_date: string;
  separation_date: string;
  dot_expiration_date: string;
  qual_cert_expiration_date: string;
  daily_pay_rate: string;
  daily_pay_effective_date: string;
  dswid: string;
  scanner_serial: string;
  fuel_card: string;
  pin_id_no: string;
  employment_status: string;
  status: string;
  market: string;
  market_code: string;
  job_title: string;
  notes: string;
  issues: string[];
};

type ImportRowError = {
  row_number?: number | string | null;
  full_name?: string | null;
  error?: string | null;
};

const EXPECTED_HEADERS = [
  "Roster Member ID",
  "Full Name",
  "Email",
  "Phone",
  "Date of Birth",
  "FX ID",
  "Role",
  "License Number",
  "Issuing State",
  "License Issue Date",
  "License Expiration Date",
  "Address Line 1",
  "Address Line 2",
  "City",
  "State Region",
  "Postal Code",
  "Hire Date",
  "Separation Date",
  "DOT Expiration Date",
  "Qual Cert Expiration Date",
  "Daily Pay Rate",
  "Daily Pay Effective Date",
  "DSWID",
  "Scanner Serial",
  "Fuel Card",
  "PIN ID No",
  "Employment Status",
  "Market",
  "Job Title",
  "Notes",
] as const;

const DATE_HEADERS = [
  "Date of Birth",
  "License Issue Date",
  "License Expiration Date",
  "Hire Date",
  "Separation Date",
  "DOT Expiration Date",
  "Qual Cert Expiration Date",
  "Daily Pay Effective Date",
] as const;

function StepCard(props: {
  eyebrow: string;
  title: string;
  body: string;
}) {
  const { eyebrow, title, body } = props;

  return (
    <article className="value-card">
      <p className="value-card__eyebrow">{eyebrow}</p>
      <h3 className="value-card__title">{title}</h3>
      <p className="value-card__body">{body}</p>
    </article>
  );
}

function splitCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells.map((cell) => cell.replace(/^"|"$/g, "").trim());
}

function normalizeStatus(value: string) {
  const v = value.trim().toLowerCase();

  if (!v) return "";
  if (v === "active") return "Active";
  if (v === "candidate") return "Candidate";
  if (v === "former" || v === "inactive") return "Former";

  return value.trim();
}

function normalizeDate(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!match) return trimmed;

  const month = match[1].padStart(2, "0");
  const day = match[2].padStart(2, "0");
  const rawYear = match[3];
  const year =
    rawYear.length === 2
      ? Number(rawYear) >= 50
        ? `19${rawYear}`
        : `20${rawYear}`
      : rawYear;

  return `${year}-${month}-${day}`;
}

function isIsoDate(value: string) {
  if (!value) return true;
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export default function CompanyRosterImportPage() {
  const params = useParams();
  const router = useRouter();
  const slug = String(params?.slug ?? "");
  const lob = useLob();

  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [commitMessage, setCommitMessage] = useState<string | null>(null);
  const [commitRowErrors, setCommitRowErrors] = useState<ImportRowError[]>([]);
  const [committing, setCommitting] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [decisions, setDecisions] = useState<Array<{
    row_number: number;
    decision: "NEW" | "UPDATE_DRAFT" | "UNCHANGED" | "CONFLICT" | "INVALID";
    roster_member_id: string | null;
    matched_fields: string[];
    changed_fields: string[];
    issues: string[];
  }>>([]);

  const validRows = useMemo(
    () => rows.filter((row) => row.issues.length === 0),
    [rows]
  );

  const invalidRows = useMemo(
    () => rows.filter((row) => row.issues.length > 0),
    [rows]
  );

  async function handleFileChange(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];

    if (!file) {
      setFileName("");
      setRows([]);
      setError(null);
      setCommitError(null);
      setCommitMessage(null);
      setCommitRowErrors([]);
      return;
    }

    setFileName(file.name);
    setError(null);
    setCommitError(null);
    setCommitMessage(null);
    setDecisions([]);

    try {
      const text = await file.text();
      const lines = text
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      if (lines.length < 2) {
        setRows([]);
        setError("CSV must include a header row and at least one data row.");
        return;
      }

      const headerCells = splitCsvLine(lines[0]);
      const missingHeaders = EXPECTED_HEADERS.filter(
        (header) => !headerCells.includes(header)
      );

      if (missingHeaders.length > 0) {
        setRows([]);
        setError(`Missing required headers: ${missingHeaders.join(", ")}`);
        return;
      }

      const indexOf = (header: (typeof EXPECTED_HEADERS)[number]) =>
        headerCells.indexOf(header);

      const valueFor = (
        cells: string[],
        header: (typeof EXPECTED_HEADERS)[number]
      ) => cells[indexOf(header)] ?? "";

      const parsed: ParsedRow[] = lines.slice(1).map((line, index) => {
        const cells = splitCsvLine(line);

        const row: ParsedRow = {
          row_number: index + 2,
          roster_member_id: valueFor(cells, "Roster Member ID"),
          full_name: valueFor(cells, "Full Name"),
          email: valueFor(cells, "Email"),
          phone: valueFor(cells, "Phone"),
          date_of_birth: normalizeDate(valueFor(cells, "Date of Birth")),
          fx_id: valueFor(cells, "FX ID"),
          role: valueFor(cells, "Role"),
          worker_type: valueFor(cells, "Role"),
          license_number: valueFor(cells, "License Number"),
          issuing_state: valueFor(cells, "Issuing State"),
          license_issue_date: normalizeDate(valueFor(cells, "License Issue Date")),
          license_expiration_date: normalizeDate(valueFor(cells, "License Expiration Date")),
          address_line_1: valueFor(cells, "Address Line 1"),
          address_line_2: valueFor(cells, "Address Line 2"),
          city: valueFor(cells, "City"),
          state_region: valueFor(cells, "State Region"),
          postal_code: valueFor(cells, "Postal Code"),
          hire_date: normalizeDate(valueFor(cells, "Hire Date")),
          start_date: normalizeDate(valueFor(cells, "Hire Date")),
          separation_date: normalizeDate(valueFor(cells, "Separation Date")),
          dot_expiration_date: normalizeDate(valueFor(cells, "DOT Expiration Date")),
          qual_cert_expiration_date: normalizeDate(valueFor(cells, "Qual Cert Expiration Date")),
          daily_pay_rate: valueFor(cells, "Daily Pay Rate").replace(/^\$/, ""),
          daily_pay_effective_date: normalizeDate(valueFor(cells, "Daily Pay Effective Date")),
          dswid: valueFor(cells, "DSWID"),
          scanner_serial: valueFor(cells, "Scanner Serial"),
          fuel_card: valueFor(cells, "Fuel Card"),
          pin_id_no: valueFor(cells, "PIN ID No"),
          employment_status: normalizeStatus(valueFor(cells, "Employment Status")),
          status: normalizeStatus(valueFor(cells, "Employment Status")),
          market: valueFor(cells, "Market"),
          market_code: valueFor(cells, "Market"),
          job_title: valueFor(cells, "Job Title"),
          notes: valueFor(cells, "Notes"),
          issues: [],
        };

        if (!row.full_name.trim()) {
          row.issues.push("Missing Full Name");
        }

        if (!row.role.trim()) {
          row.issues.push("Missing Role");
        }

        if (!row.status.trim()) {
          row.issues.push("Missing Employment Status");
        } else if (!["Active", "Candidate", "Former"].includes(row.status)) {
          row.issues.push("Employment Status must be Active, Candidate, or Former");
        }

        for (const header of DATE_HEADERS) {
          const key = header
            .toLowerCase()
            .replace(/ /g, "_") as keyof ParsedRow;
          const value = row[key];

          if (typeof value === "string" && value && !isIsoDate(value)) {
            row.issues.push(`${header} must be YYYY-MM-DD or M/D/YYYY`);
          }
        }

        return row;
      });

      setRows(parsed);
    } catch {
      setRows([]);
      setError("Failed to read CSV file.");
    }
  }

  async function handleAnalyzeImport() {
    try {
      setAnalyzing(true);
      setCommitError(null);
      setCommitMessage(null);
      const res = await fetch(`/api/company/${slug}/people/roster/import/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ rows }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCommitError(data?.error ?? "Failed to analyze roster import.");
        return;
      }
      setDecisions(Array.isArray(data?.decisions) ? data.decisions : []);
    } catch {
      setCommitError("Analysis request failed.");
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleCommitImport() {
    try {
      setCommitting(true);
      setCommitError(null);
      setCommitMessage(null);

      if (validRows.length === 0) {
        setCommitError("No valid rows available to import.");
        return;
      }

      const res = await fetch(
        `/api/company/${slug}/people/roster/import/commit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            rows,
            approved_row_numbers: decisions
              .filter((item) => item.decision === "NEW" || item.decision === "UPDATE_DRAFT")
              .map((item) => item.row_number),
          }),
        }
      );

      const data = await res.json();

      const rowErrors = Array.isArray(data?.errors)
        ? (data.errors as ImportRowError[])
        : [];

      if (!res.ok) {
        setCommitError(data?.error ?? "Failed to commit roster import.");
        setCommitRowErrors(rowErrors);
        return;
      }

      setCommitMessage(
        `Import complete: ${data?.inserted_count ?? 0} inserted, ${data?.updated_count ?? 0} updated, ${data?.skipped_count ?? 0} skipped.`
      );

      router.push(`/company/${slug}/people/roster`);
      router.refresh();
    } catch {
      setCommitError("Commit request failed.");
    } finally {
      setCommitting(false);
    }
  }

  return (
    <main className="workspace-shell">

      <section className="value-strip">
        <div className="value-grid">
          <article className="value-card" style={{ gridColumn: "1 / -1" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 16,
                alignItems: "flex-start",
                flexWrap: "wrap",
              }}
            >
              <div>
                <p className="value-card__eyebrow">People</p>
                <h2 className="value-card__title">Import roster</h2>
                <p className="value-card__body">
                  Bring workforce records into Insight using the roster template.
                  This step parses the CSV locally, previews the rows, and
                  commits valid rows into the company roster.
                </p>
              </div>

              <div style={{ minWidth: 260, display: "grid", gap: 10 }}>
                <div className="hero-stat">
                  <span className="hero-stat__label">LOB</span>
                  <strong>{lob.lob_label}</strong>
                </div>

                <div className="hero-stat">
                  <span className="hero-stat__label">Industry</span>
                  <strong>{lob.industry_label}</strong>
                </div>
              </div>
            </div>

            <div className="cta-row" style={{ marginTop: 14 }}>
              <Link className="button" href={`/company/${slug}/people/roster`}>
                Back to roster
              </Link>

              <a className="button" href="/api/people/roster-template">
                Download template CSV
              </a>

              <button
                type="button"
                className="button"
                onClick={handleAnalyzeImport}
                disabled={analyzing || validRows.length === 0}
              >
                {analyzing ? "Analyzing..." : "Analyze import"}
              </button>

              <button
                type="button"
                className="button button-primary"
                onClick={handleCommitImport}
                disabled={committing || decisions.every((item) => item.decision !== "NEW" && item.decision !== "UPDATE_DRAFT")}
              >
                {committing ? "Importing..." : "Commit approved rows"}
              </button>
            </div>

            {commitError ? (
              <p style={{ color: "#c62828", marginTop: 14 }}>{commitError}</p>
            ) : null}

            {commitRowErrors.length > 0 ? (
              <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
                {commitRowErrors.map((rowError, index) => (
                  <p key={`${rowError.row_number ?? "row"}-${index}`} style={{ color: "#c62828", margin: 0, fontSize: 13 }}>
                    <strong>{rowError.full_name || `Row ${rowError.row_number ?? "unknown"}`}:</strong>{" "}
                    {rowError.error || "Import failed for this row."}
                  </p>
                ))}
              </div>
            ) : null}

            {commitMessage ? (
              <p style={{ color: "#0f9f6e", marginTop: 14 }}>{commitMessage}</p>
            ) : null}
          </article>

          <StepCard
            eyebrow="Step 1"
            title="Download the template"
            body="Use the Insight roster template so the import headers match the parser."
          />

          <StepCard
            eyebrow="Step 2"
            title="Upload your CSV"
            body="The parser validates required fields and shows preview rows before commit."
          />

          <StepCard
            eyebrow="Step 3"
            title="Review and commit"
            body="Insight reconciles each row as new, update draft, unchanged, conflict, or invalid before any database write."
          />

          <article className="value-card" style={{ gridColumn: "1 / -1" }}>
            <p className="value-card__eyebrow">Upload CSV</p>
            <h3 className="value-card__title">Choose roster file</h3>

            <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
              />

              {fileName ? (
                <p className="value-card__body">Loaded file: {fileName}</p>
              ) : null}

              {error ? (
                <p style={{ color: "#c62828", margin: 0 }}>{error}</p>
              ) : null}

              <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                <div className="hero-stat" style={{ minWidth: 180 }}>
                  <span className="hero-stat__label">Parsed rows</span>
                  <strong>{rows.length}</strong>
                </div>

                <div className="hero-stat" style={{ minWidth: 180 }}>
                  <span className="hero-stat__label">Valid rows</span>
                  <strong>{validRows.length}</strong>
                </div>

                <div className="hero-stat" style={{ minWidth: 180 }}>
                  <span className="hero-stat__label">Rows with issues</span>
                  <strong>{invalidRows.length}</strong>
                </div>
              </div>
            </div>
          </article>

          {decisions.length > 0 ? (
            <article className="value-card" style={{ gridColumn: "1 / -1" }}>
              <p className="value-card__eyebrow">Reconciliation</p>
              <h3 className="value-card__title">Import decision set</h3>
              <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 14 }}>
                {["NEW", "UPDATE_DRAFT", "UNCHANGED", "CONFLICT", "INVALID"].map((kind) => (
                  <div className="hero-stat" key={kind}>
                    <span className="hero-stat__label">{kind.replace("_", " ")}</span>
                    <strong>{decisions.filter((item) => item.decision === kind).length}</strong>
                  </div>
                ))}
              </div>
            </article>
          ) : null}

          <article className="value-card" style={{ gridColumn: "1 / -1" }}>
            <p className="value-card__eyebrow">Preview</p>
            <h3 className="value-card__title">Parsed roster rows</h3>

            {rows.length === 0 ? (
              <p className="value-card__body" style={{ marginTop: 14 }}>
                No CSV loaded yet.
              </p>
            ) : (
              <div style={{ marginTop: 16, overflowX: "auto" }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    minWidth: 1200,
                  }}
                >
                  <thead>
                    <tr>
                      {[
                        "Row",
                        "Decision",
                        "Roster ID",
                        "Full Name",
                        "Email",
                        "Phone",
                        "DOB",
                        "Role",
                        "Market",
                        "Hire Date",
                        "Status",
                        "FX ID",
                        "License",
                        "DL Exp",
                        "DOT Exp",
                        "Qual Exp",
                        "Daily Pay",
                        "DSWID",
                        "Issues",
                      ].map((label) => (
                        <th
                          key={label}
                          style={{
                            textAlign: "left",
                            padding: "10px 12px",
                            borderBottom: "1px solid #d6dfeb",
                            fontSize: 12,
                            letterSpacing: "0.04em",
                            textTransform: "uppercase",
                            color: "#5c6b84",
                          }}
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.row_number}>
                        <td style={cellStyle}>{row.row_number}</td>
                        <td style={cellStyle}>{decisions.find((item) => item.row_number === row.row_number)?.decision ?? "Not analyzed"}</td>
                        <td style={cellStyle}>{row.roster_member_id || decisions.find((item) => item.row_number === row.row_number)?.roster_member_id || "—"}</td>
                        <td style={cellStyle}>{row.full_name || "—"}</td>
                        <td style={cellStyle}>{row.email || "—"}</td>
                        <td style={cellStyle}>{row.phone || "—"}</td>
                        <td style={cellStyle}>{row.date_of_birth || "—"}</td>
                        <td style={cellStyle}>{row.role || "—"}</td>
                        <td style={cellStyle}>{row.market || "—"}</td>
                        <td style={cellStyle}>{row.hire_date || "—"}</td>
                        <td style={cellStyle}>{row.status || "—"}</td>
                        <td style={cellStyle}>{row.fx_id || "—"}</td>
                        <td style={cellStyle}>{row.license_number || "—"}</td>
                        <td style={cellStyle}>{row.license_expiration_date || "—"}</td>
                        <td style={cellStyle}>{row.dot_expiration_date || "—"}</td>
                        <td style={cellStyle}>{row.qual_cert_expiration_date || "—"}</td>
                        <td style={cellStyle}>{row.daily_pay_rate || "—"}</td>
                        <td style={cellStyle}>{row.dswid || "—"}</td>
                        <td style={cellStyle}>
                          {row.issues.length === 0 ? (
                            <span>Ready</span>
                          ) : (
                            <span style={{ color: "#c62828" }}>
                              {row.issues.join("; ")}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>
        </div>
      </section>
    </main>
  );
}

const cellStyle: React.CSSProperties = {
  padding: "12px",
  borderBottom: "1px solid #e6edf5",
  verticalAlign: "top",
};
