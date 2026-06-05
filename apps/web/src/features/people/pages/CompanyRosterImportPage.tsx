"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useLob } from "@/features/lob/hooks/useLob";

type ParsedRow = {
  row_number: number;
  full_name: string;
  email: string;
  phone: string;
  role: string;
  market: string;
  start_date: string;
  status: string;
  fx_id: string;
  dswid: string;
  issues: string[];
};

const EXPECTED_HEADERS = [
  "Full Name",
  "Email",
  "Phone",
  "Role",
  "Market",
  "Start Date",
  "Status",
  "FX ID",
  "DSWID",
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
  const [committing, setCommitting] = useState(false);

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
      return;
    }

    setFileName(file.name);
    setError(null);
    setCommitError(null);
    setCommitMessage(null);

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

      const parsed: ParsedRow[] = lines.slice(1).map((line, index) => {
        const cells = splitCsvLine(line);

        const row: ParsedRow = {
          row_number: index + 2,
          full_name: cells[indexOf("Full Name")] ?? "",
          email: cells[indexOf("Email")] ?? "",
          phone: cells[indexOf("Phone")] ?? "",
          role: cells[indexOf("Role")] ?? "",
          market: cells[indexOf("Market")] ?? "",
          start_date: cells[indexOf("Start Date")] ?? "",
          status: normalizeStatus(cells[indexOf("Status")] ?? ""),
          fx_id: cells[indexOf("FX ID")] ?? "",
          dswid: cells[indexOf("DSWID")] ?? "",
          issues: [],
        };

        if (!row.full_name.trim()) {
          row.issues.push("Missing Full Name");
        }

        if (!row.role.trim()) {
          row.issues.push("Missing Role");
        }

        if (!row.status.trim()) {
          row.issues.push("Missing Status");
        } else if (!["Active", "Candidate", "Former"].includes(row.status)) {
          row.issues.push("Status must be Active, Candidate, or Former");
        }

        if (row.start_date && !isIsoDate(row.start_date)) {
          row.issues.push("Start Date must be YYYY-MM-DD");
        }

        return row;
      });

      setRows(parsed);
    } catch {
      setRows([]);
      setError("Failed to read CSV file.");
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
          body: JSON.stringify({ rows }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        setCommitError(data?.error ?? "Failed to commit roster import.");
        return;
      }

      setCommitMessage(
        `Imported ${data?.inserted_count ?? validRows.length} roster row(s).`
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
                className="button button-primary"
                onClick={handleCommitImport}
                disabled={committing || validRows.length === 0}
              >
                {committing ? "Importing..." : "Commit import"}
              </button>
            </div>

            {commitError ? (
              <p style={{ color: "#c62828", marginTop: 14 }}>{commitError}</p>
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
            title="Commit valid rows"
            body="Only rows with no issues are inserted into core.company_roster and identifier rows are added after."
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
                        "Full Name",
                        "Email",
                        "Phone",
                        "Role",
                        "Market",
                        "Start Date",
                        "Status",
                        "FX ID",
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
                        <td style={cellStyle}>{row.full_name || "—"}</td>
                        <td style={cellStyle}>{row.email || "—"}</td>
                        <td style={cellStyle}>{row.phone || "—"}</td>
                        <td style={cellStyle}>{row.role || "—"}</td>
                        <td style={cellStyle}>{row.market || "—"}</td>
                        <td style={cellStyle}>{row.start_date || "—"}</td>
                        <td style={cellStyle}>{row.status || "—"}</td>
                        <td style={cellStyle}>{row.fx_id || "—"}</td>
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