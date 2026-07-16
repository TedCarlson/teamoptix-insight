"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { complianceSignalKey, type RosterComplianceSignal } from "@/features/compliance/lib/rosterCompliance";

type QueuePerson = { roster_member_id: string; full_name: string; compliance_signals: RosterComplianceSignal[] };

export default function PeopleCompliancePage() {
  const slug = String(useParams()?.slug ?? "");
  const router = useRouter();
  const [people, setPeople] = useState<QueuePerson[]>([]);
  const [reviewed, setReviewed] = useState<string[]>([]);
  const storageKey = `teamoptix:${slug}:compliance-reviews`;

  useEffect(() => {
    Promise.resolve().then(() => {
      try {
        const saved = window.localStorage.getItem(storageKey);
        setReviewed(saved ? JSON.parse(saved) : []);
      } catch {
        setReviewed([]);
      }
    });
    fetch(`/api/company/${slug}/people/roster`, { credentials: "include", cache: "no-store" })
      .then((response) => response.json())
      .then((data) => setPeople(Array.isArray(data?.roster) ? data.roster : []))
      .catch(() => setPeople([]));
  }, [slug, storageKey]);

  const items = useMemo(() => people.flatMap((person) => person.compliance_signals.map((signal) => ({ person, signal, key: `${person.roster_member_id}:${complianceSignalKey(signal)}` }))).filter((item) => !reviewed.includes(item.key)), [people, reviewed]);

  function review(item: (typeof items)[number]) {
    const next = [...reviewed, item.key];
    setReviewed(next);
    window.localStorage.setItem(storageKey, JSON.stringify(next));
    router.push(`/company/${slug}/people/roster?person=${item.person.roster_member_id}&section=compliance`);
  }

  return (
    <main className="page-shell">
      <section className="panel">
        <p className="eyebrow">People</p>
        <h1>Compliance Review Queue</h1>
        <p className="muted">Expiring, expired, and missing workforce documents derived from company-owned facts.</p>
      </section>
      <section className="panel" style={{ display: "grid", gap: 10 }}>
        {items.length === 0 ? <p className="muted">No documents currently need manager review.</p> : items.map((item) => (
          <article key={item.key} className="app-card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: 14 }}>
            <div>
              <strong>{item.person.full_name}</strong>
              <p className="muted" style={{ margin: "4px 0 0" }}>{item.signal.label} · {item.signal.status === "missing" ? "Missing" : item.signal.status === "expired" ? "Expired" : `${item.signal.daysRemaining} days remaining`}</p>
            </div>
            <button type="button" className="button button-primary" onClick={() => review(item)}>Review</button>
          </article>
        ))}
      </section>
    </main>
  );
}
