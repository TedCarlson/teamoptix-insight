"use client";

import { useEffect, useState } from "react";

type Suggestion = {
  roster_member_id: string;
  full_name: string;
  dswid: string | null;
  employment_status: string | null;
  worker_type: string | null;
  score: number;
};

type Unmatched = {
  person_name: string;
  rows: number;
  service_dates: string[];
  total_stops: number;
  examples: { service_date: string; route_name: string | null; wa_number: string | null }[];
  suggestions: Suggestion[];
};

export default function PayrollDswAliasTool({
  slug,
  weekEnd,
}: {
  slug: string;
  weekEnd: string;
}) {
  const [rows, setRows] = useState<Unmatched[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/company/${slug}/payroll/dsw-unmatched?weekEnd=${weekEnd}`, {
      credentials: "include",
      cache: "no-store",
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error ?? "Failed to load unmatched aliases.");
    setRows(data?.unmatched ?? []);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Failed to load unmatched aliases."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, weekEnd]);

  async function saveAlias(row: Unmatched, suggestion: Suggestion) {
    const saveKey = `${row.person_name}-${suggestion.roster_member_id}`;
    setSaving(saveKey);
    setError(null);

    try {
      const res = await fetch(`/api/company/${slug}/payroll/dsw-alias`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          alias_text: row.person_name,
          roster_id: suggestion.roster_member_id,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to save alias.");

      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save alias.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div style={{ padding: 12, display: "grid", gap: 10 }}>
      {error ? <div style={{ color: "#991b1b", fontWeight: 900 }}>{error}</div> : null}

      {rows.length === 0 ? (
        <div style={{ color: "#166534", fontWeight: 900 }}>No unresolved DSW aliases.</div>
      ) : (
        rows.map((row) => (
          <div key={row.person_name} style={{ border: "1px solid #e6edf5", borderRadius: 12, padding: 10 }}>
            <div style={{ fontWeight: 950 }}>{row.person_name}</div>
            <div style={{ color: "#64748b", fontSize: 12, fontWeight: 800 }}>
              {row.rows} row(s) · {row.total_stops} stops · {row.service_dates.join(", ")}
            </div>
            <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
              {row.suggestions.length === 0 ? (
                <span style={{ color: "#991b1b", fontWeight: 850 }}>No suggestions</span>
              ) : (
                row.suggestions.map((s) => {
                  const saveKey = `${row.person_name}-${s.roster_member_id}`;
                  return (
                    <button
                      key={s.roster_member_id}
                      type="button"
                      className="button"
                      disabled={saving === saveKey}
                      onClick={() => saveAlias(row, s)}
                    >
                      {saving === saveKey ? "Saving..." : `Link to ${s.full_name}`}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
