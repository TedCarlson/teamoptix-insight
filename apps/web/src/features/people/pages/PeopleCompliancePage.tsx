"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { RosterComplianceSignal, RosterComplianceStatus } from "@/features/compliance/lib/rosterCompliance";
import { usePeopleWorkspaceRoster } from "@/features/people/hooks/usePeopleWorkspaceRoster";
import type { RosterRow } from "@/features/people/types/roster.types";

type Filter = "all" | RosterComplianceStatus;
type QueueItem = { person: RosterRow; signal: RosterComplianceSignal };

function statusLabel(signal: RosterComplianceSignal) {
  if (signal.status === "missing") return "Missing";
  if (signal.status === "expired") return "Expired";
  if (signal.status === "urgent") return "Due within 30 days";
  return "Due within 60 days";
}

function expirationLabel(signal: RosterComplianceSignal) {
  if (!signal.expirationDate) return "Not recorded";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${signal.expirationDate.slice(0, 10)}T00:00:00Z`));
}

export default function PeopleCompliancePage() {
  const slug = String(useParams()?.slug ?? "");
  const router = useRouter();
  const { rows, loading, error } = usePeopleWorkspaceRoster(slug);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");

  const currentPeople = useMemo(() => rows.filter((row) => row.employment_status !== "Former"), [rows]);
  const queue = useMemo<QueueItem[]>(() => currentPeople.flatMap((person) => (person.compliance_signals ?? []).map((signal) => ({ person, signal }))), [currentPeople]);
  const counts = useMemo(() => ({
    all: queue.length,
    missing: queue.filter((item) => item.signal.status === "missing").length,
    expired: queue.filter((item) => item.signal.status === "expired").length,
    urgent: queue.filter((item) => item.signal.status === "urgent").length,
    warning: queue.filter((item) => item.signal.status === "warning").length,
  }), [queue]);
  const clearPeople = useMemo(() => currentPeople.filter((person) => !(person.compliance_signals ?? []).length).length, [currentPeople]);
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return queue
      .filter((item) => filter === "all" || item.signal.status === filter)
      .filter((item) => !term || `${item.person.full_name} ${item.person.worker_type ?? ""} ${item.signal.label}`.toLowerCase().includes(term))
      .sort((a, b) => {
        const priority = { missing: 0, expired: 1, urgent: 2, warning: 3 };
        return priority[a.signal.status] - priority[b.signal.status] || a.person.full_name.localeCompare(b.person.full_name);
      });
  }, [filter, queue, search]);

  const filters: Array<{ key: Filter; label: string; count: number }> = [
    { key: "all", label: "Needs action", count: counts.all },
    { key: "missing", label: "Missing", count: counts.missing },
    { key: "expired", label: "Expired", count: counts.expired },
    { key: "urgent", label: "Due ≤30 days", count: counts.urgent },
    { key: "warning", label: "Due 31–60 days", count: counts.warning },
  ];

  return <main className="workspace-shell">
    <section className="workspace-main people-compliance-workspace">
      <div className="people-workspace-toolbar">
        <div className="people-workspace-stats" aria-label="Compliance summary">
          <span><small>Workforce</small><strong>{currentPeople.length}</strong></span>
          <span><small>Clear</small><strong>{clearPeople}</strong></span>
          <span className={counts.expired + counts.missing ? "is-alert" : ""}><small>Missing / expired</small><strong>{counts.missing + counts.expired}</strong></span>
          <span className={counts.urgent ? "is-warning" : ""}><small>Due within 30 days</small><strong>{counts.urgent}</strong></span>
        </div>
        <input className="people-workspace-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search person or document" aria-label="Search compliance queue" />
      </div>

      <div className="people-filter-row" role="group" aria-label="Compliance status">
        {filters.map((item) => <button key={item.key} className={filter === item.key ? "button button-primary" : "button"} type="button" onClick={() => setFilter(item.key)}>{item.label} <span>{item.count}</span></button>)}
      </div>

      <section className="app-card people-data-surface">
        {error ? <p className="people-workspace-message is-error">{error}</p> : loading ? <p className="people-workspace-message">Loading compliance records…</p> : visible.length === 0 ? <p className="people-workspace-message">{queue.length ? "No records match this view." : "No workforce documents currently need attention."}</p> : <div className="people-table-scroll"><table className="people-workspace-table"><thead><tr><th>Person</th><th>Role</th><th>Document</th><th>Status</th><th>Expiration</th><th>Timing</th><th></th></tr></thead><tbody>{visible.map(({ person, signal }) => <tr key={`${person.roster_member_id}:${signal.documentType}:${signal.expirationDate ?? "missing"}`}><td><strong>{person.full_name}</strong></td><td>{person.worker_type || "—"}</td><td>{signal.label}</td><td><span className={`compliance-status compliance-status--${signal.status}`}>{statusLabel(signal)}</span></td><td>{expirationLabel(signal)}</td><td>{signal.daysRemaining == null ? "Required" : signal.daysRemaining < 0 ? `${Math.abs(signal.daysRemaining)} days overdue` : `${signal.daysRemaining} days`}</td><td><button type="button" className="button" onClick={() => router.push(`/company/${slug}/people/roster?person=${person.roster_member_id}&section=compliance`)}>Review person</button></td></tr>)}</tbody></table></div>}
      </section>
    </section>
  </main>;
}
