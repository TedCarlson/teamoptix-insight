"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import SiteHeader from "@/features/landing/components/SiteHeader";
import { useLob } from "@/features/lob/hooks/useLob";

type ApiRosterRow = {
  roster_member_id: string;
  full_name: string | null;
  worker_type: string | null;
  employment_status: "Active" | "Candidate" | "Former" | null;
  market_code: string | null;
  reports_to_name: string | null;
  hire_date: string | null;
  invite_status: string | null;
  compliance_summary: string | null;
  onboarding_completed_at?: string | null;
};

type PipelineCandidateRow = {
  id: string;
  full_name: string;
  role: string;
  market: string;
  stage: string;
  invite_status: string;
  progress: string;
  compliance: string;
};

function SummaryCard(props: {
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

function deriveStage(row: {
  invite_status: string | null;
  compliance_summary: string | null;
  onboarding_completed_at?: string | null;
}) {
  if (row.onboarding_completed_at) return "Ready for Activation";
  if (row.invite_status === "Accepted") return "Onboarding";
  if (row.invite_status === "Invited") return "Invited";
  if (row.compliance_summary === "Compliant") return "Ready";
  return "Candidate Created";
}

function deriveProgress(stage: string) {
  if (stage === "Ready for Activation") return "100%";
  if (stage === "Ready") return "90%";
  if (stage === "Onboarding") return "70%";
  if (stage === "Invited") return "35%";
  return "10%";
}

export default function HiringPipelinePage() {
  const params = useParams();
  const slug = String(params?.slug ?? "");
  const lob = useLob();

  const [rows, setRows] = useState<PipelineCandidateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let active = true;

    async function loadCandidates() {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(`/api/company/${slug}/people/roster`, {
          credentials: "include",
        });

        const data = await res.json();

        if (!active) return;

        if (!res.ok) {
          setError(data?.error ?? "Failed to load candidate pipeline.");
          setRows([]);
          return;
        }

        const normalized: PipelineCandidateRow[] = (
          (data?.roster ?? []) as ApiRosterRow[]
        )
          .filter((row) => row.employment_status === "Candidate")
          .map((row) => {
            const inviteStatus = row.invite_status ?? "Not Invited";
            const compliance = row.compliance_summary ?? "Missing";
            const stage = deriveStage(row);

            return {
              id: row.roster_member_id,
              full_name: row.full_name ?? "Unknown",
              role: row.worker_type ?? "Unassigned",
              market: row.market_code ?? "—",
              stage,
              invite_status: inviteStatus,
              progress: deriveProgress(stage),
              compliance,
            };
          });

        setRows(normalized);
      } catch {
        if (!active) return;
        setError("Candidate pipeline request failed.");
        setRows([]);
      } finally {
        if (active) setLoading(false);
      }
    }

    if (slug) loadCandidates();

    return () => {
      active = false;
    };
  }, [slug]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();

    if (!q) return rows;

    return rows.filter((row) => {
      return (
        row.full_name.toLowerCase().includes(q) ||
        row.role.toLowerCase().includes(q) ||
        row.market.toLowerCase().includes(q) ||
        row.stage.toLowerCase().includes(q) ||
        row.invite_status.toLowerCase().includes(q)
      );
    });
  }, [rows, search]);

  const newCount = rows.filter((row) => row.stage === "Candidate Created").length;
  const invitedCount = rows.filter((row) => row.stage === "Invited").length;
  const onboardingCount = rows.filter((row) => row.stage === "Onboarding").length;
  const readyCount = rows.filter(
    (row) => row.stage === "Ready" || row.stage === "Ready for Activation"
  ).length;

  return (
    <main className="landing-page">
      <SiteHeader />

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
                <p className="value-card__eyebrow">Hiring</p>
                <h2 className="value-card__title">Candidate pipeline</h2>
                <p className="value-card__body">
                  Manager-facing hiring workflow surface for candidates inside
                  the company roster. This page reads live candidate rows and
                  now reflects onboarding completion without auto-activating a
                  real person.
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
              <Link className="button" href={`/company/${slug}`}>
                Back to company
              </Link>
              <Link className="button" href={`/company/${slug}/people`}>
                People
              </Link>
              <Link className="button" href={`/company/${slug}/people/roster`}>
                Roster
              </Link>
            </div>
          </article>

          <SummaryCard
            eyebrow="New"
            title={String(newCount)}
            body="Candidates newly added and not yet meaningfully advanced."
          />

          <SummaryCard
            eyebrow="Invited"
            title={String(invitedCount)}
            body="Candidates who have already received an onboarding invite."
          />

          <SummaryCard
            eyebrow="Onboarding"
            title={String(onboardingCount)}
            body="Candidates actively moving through onboarding steps."
          />

          <SummaryCard
            eyebrow="Ready"
            title={String(readyCount)}
            body="Candidates who have finished onboarding and are ready for review or activation."
          />

          <article className="value-card" style={{ gridColumn: "1 / -1" }}>
            <p className="value-card__eyebrow">Pipeline controls</p>
            <h3 className="value-card__title">Filter candidate view</h3>

            <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
              <div className="cta-row">
                <button className="button" type="button">
                  All
                </button>
                <button className="button" type="button">
                  New
                </button>
                <button className="button" type="button">
                  Invited
                </button>
                <button className="button" type="button">
                  Onboarding
                </button>
                <button className="button" type="button">
                  Ready
                </button>
              </div>

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <input
                  type="text"
                  placeholder="Search candidate, role, market..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={inputStyle}
                />
                <button className="button" type="button">
                  Filters
                </button>
              </div>
            </div>
          </article>

          <article className="value-card" style={{ gridColumn: "1 / -1" }}>
            <p className="value-card__eyebrow">Pipeline</p>
            <h3 className="value-card__title">Candidate list</h3>
            <p className="value-card__body" style={{ marginTop: 8 }}>
              Live candidate rows are sourced from company roster records with
              Candidate status. Stage now recognizes onboarding completion as a
              non-activating readiness state.
            </p>

            {error ? (
              <p style={{ color: "#c62828", marginTop: 14 }}>{error}</p>
            ) : null}

            {loading ? (
              <div style={{ padding: "16px 0" }}>Loading candidate pipeline...</div>
            ) : filteredRows.length === 0 ? (
              <div style={{ padding: "16px 0" }}>No candidate rows found.</div>
            ) : (
              <div style={{ marginTop: 16, overflowX: "auto" }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    minWidth: 980,
                  }}
                >
                  <thead>
                    <tr>
                      {[
                        "Name",
                        "Role",
                        "Market",
                        "Stage",
                        "Invite",
                        "Progress",
                        "Actions",
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
                    {filteredRows.map((row) => (
                      <tr key={row.id}>
                        <td style={cellStyle}>{row.full_name}</td>
                        <td style={cellStyle}>{row.role}</td>
                        <td style={cellStyle}>{row.market}</td>
                        <td style={cellStyle}>{row.stage}</td>
                        <td style={cellStyle}>{row.invite_status}</td>
                        <td style={cellStyle}>{row.progress}</td>
                        <td style={cellStyle}>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <Link
                              className="button"
                              href={`/company/${slug}/hiring/candidate/${row.id}`}
                            >
                              View
                            </Link>
                            <button className="button" type="button">
                              Move stage
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>

          <article className="value-card" style={{ gridColumn: "1 / -1" }}>
            <p className="value-card__eyebrow">What comes next</p>
            <h3 className="value-card__title">Pipeline maturity direction</h3>
            <p className="value-card__body" style={{ marginTop: 8 }}>
              Next slice will reflect this onboarding-complete readiness state
              inside candidate detail and then add a distinct manager activation
              action.
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  height: 44,
  minWidth: 320,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid #d6dfeb",
  background: "#fff",
};

const cellStyle: React.CSSProperties = {
  padding: "12px",
  borderBottom: "1px solid #e6edf5",
  verticalAlign: "top",
};