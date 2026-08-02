"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type PolicyVersion = { id: string; version_number: number; title: string; description: string | null; content_hash: string; published_at: string; company: { name: string }; content_snapshot: { sections: Array<{ position: number; title: string; body: string }> }; acknowledgments: Array<{ employee_name: string; status: string; reviewed_at: string | null; responded_at: string | null; response_comment: string | null }> };
function formatDate(value?: string | null) { return value ? new Intl.DateTimeFormat("en", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value)) : "—"; }

export default function CompanyPolicyPrintPage() {
  const params = useParams();
  const slug = String(params?.slug ?? "");
  const versionId = String(params?.versionId ?? "");
  const [record, setRecord] = useState<PolicyVersion | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { if (!slug || !versionId) return; fetch(`/api/company/${slug}/people/policies/versions/${versionId}`, { credentials: "include", cache: "no-store" }).then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data?.error || "Unable to load this policy version."); return data; }).then(setRecord).catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to load this policy version.")); }, [slug, versionId]);
  if (!record) return <main className="policy-print-shell"><p>{error || "Loading policy…"}</p></main>;
  return <main className="policy-print-shell"><div className="policy-print-toolbar"><button className="button" onClick={() => window.close()}>Close</button><button className="button button-primary" onClick={() => window.print()}>Print / save PDF</button></div><article className="policy-print-document"><header><div><p>{record.company.name}</p><h1>{record.title}</h1><span>{record.description}</span></div><div><strong>Version {record.version_number}</strong><span>Released {formatDate(record.published_at)}</span></div></header>{record.content_snapshot.sections.map((section) => <section key={`${section.position}-${section.title}`}><span>{section.position}</span><div><h2>{section.title}</h2>{section.body.split(/\n{2,}/).filter(Boolean).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div></section>)}{record.acknowledgments.length ? <section className="policy-print-ack"><div><h2>Acknowledgment record</h2><p>Responses tied to this immutable policy version.</p></div><table><thead><tr><th>Employee</th><th>Status</th><th>Reviewed</th><th>Responded</th></tr></thead><tbody>{record.acknowledgments.map((item) => <tr key={item.employee_name}><td>{item.employee_name}</td><td>{item.status.toLowerCase()}</td><td>{formatDate(item.reviewed_at)}</td><td>{formatDate(item.responded_at)}</td></tr>)}</tbody></table></section> : null}<footer>Evidence reference · Version {record.version_number} · {record.content_hash}</footer></article></main>;
}

