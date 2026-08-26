"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Assignment = { assignment_id: string; roster_member_id: string | null; profile_id: string | null; is_primary: boolean; full_name: string | null; email: string | null };
type Role = { role_key: string; role_label: string; description: string; target_source: "profile" | "roster"; max_assignments: number | null; assignments: Assignment[] };
type RosterPerson = { roster_member_id: string; full_name: string; email: string | null; worker_type: string | null };
type OperatorProfile = { profile_id: string; display_name: string; email: string };
type Payload = { can_manage: boolean; roles: Role[]; roster: RosterPerson[]; operator_profiles: OperatorProfile[] };

export default function CompanyLeadershipManager({ slug }: { slug: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingRole, setSavingRole] = useState<string | null>(null);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/company/${slug}/config/leadership`, { cache: "no-store", credentials: "include" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error ?? "Failed to load leadership.");
      setData(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load leadership.");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => { void load(); }, [load]);

  const roles = useMemo(() => data?.roles ?? [], [data?.roles]);
  const assignmentCount = useMemo(() => roles.reduce((count, role) => count + role.assignments.length, 0), [roles]);
  const openRoleCount = useMemo(() => roles.filter((role) => role.assignments.length === 0).length, [roles]);

  async function addAssignment(role: Role) {
    const selectedId = selections[role.role_key] ?? "";
    if (!selectedId) return;
    const isOperator = role.target_source === "profile";
    setSavingRole(role.role_key);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/company/${slug}/config/leadership`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "add", role_key: role.role_key, roster_member_id: isOperator ? null : selectedId, profile_id: isOperator ? selectedId : null }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error ?? "Failed to update leadership.");
      setData(payload);
      setSelections((current) => ({ ...current, [role.role_key]: "" }));
      setMessage(`${role.role_label} assignment added.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to update leadership.");
    } finally {
      setSavingRole(null);
    }
  }

  async function removeAssignment(role: Role, assignmentId: string) {
    setSavingRole(role.role_key);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/company/${slug}/config/leadership`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "remove", assignment_id: assignmentId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error ?? "Failed to remove leadership assignment.");
      setData(payload);
      setMessage(`${role.role_label} assignment removed.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to remove leadership assignment.");
    } finally {
      setSavingRole(null);
    }
  }

  if (loading) return <p className="app-card__body">Loading leadership assignments…</p>;
  if (!data) return <div style={{ display: "grid", gap: 10 }}><p style={{ color: "#b91c1c", margin: 0 }}>{error ?? "Leadership is unavailable."}</p><button type="button" className="button" onClick={() => void load()}>Try again</button></div>;

  return (
    <section style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
        <div className="context-stat"><span className="context-stat__label">Assignments</span><strong>{assignmentCount}</strong></div>
        <div className="context-stat"><span className="context-stat__label">Open roles</span><strong>{openRoleCount}</strong></div>
        <div className="context-stat"><span className="context-stat__label">Leadership roles</span><strong>{roles.length}</strong></div>
      </div>

      <div style={{ border: "1px solid #bfdbfe", background: "#eff6ff", borderRadius: 12, padding: 12, color: "#1e3a8a", fontSize: 13 }}>
        Leadership responsibility and workspace authorization are coordinated when a person&apos;s company role changes. This page remains available for direct coverage changes. Business Contact and Assistant BC support multiple people.
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {roles.map((role) => {
          const isOperator = role.target_source === "profile";
          const assignedIds = new Set(role.assignments.map((assignment) => isOperator ? assignment.profile_id : assignment.roster_member_id));
          const candidates = isOperator ? data.operator_profiles.filter((person) => !assignedIds.has(person.profile_id)) : data.roster.filter((person) => !assignedIds.has(person.roster_member_id));
          const atLimit = role.max_assignments !== null && role.assignments.length >= role.max_assignments;
          return (
            <article key={role.role_key} style={{ display: "grid", gap: 12, border: "1px solid #e2e8f0", borderRadius: 14, padding: 14, background: "#fff" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <div style={{ display: "grid", gap: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <strong>{role.role_label}</strong>
                    <span style={{ borderRadius: 999, padding: "2px 8px", fontSize: 11, fontWeight: 800, color: role.assignments.length ? "#166534" : "#92400e", background: role.assignments.length ? "#dcfce7" : "#fef3c7" }}>{role.assignments.length ? `${role.assignments.length} assigned` : "Open"}</span>
                  </div>
                  <span style={{ color: "#64748b", fontSize: 12 }}>{role.description}</span>
                </div>
                <span style={{ color: "#475569", fontSize: 11, fontWeight: 700 }}>{role.max_assignments === null ? "Multiple allowed" : `Up to ${role.max_assignments}`}</span>
              </div>

              {role.assignments.length ? <div style={{ display: "grid", gap: 7 }}>
                {role.assignments.map((assignment) => (
                  <div key={assignment.assignment_id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: 10, border: "1px solid #e2e8f0", borderRadius: 10 }}>
                    <span style={{ display: "grid", gap: 2 }}><strong style={{ fontSize: 13 }}>{assignment.full_name || assignment.email || "Assigned leader"}{assignment.is_primary ? " · Primary" : ""}</strong>{assignment.email ? <small style={{ color: "#64748b" }}>{assignment.email}</small> : null}</span>
                    {data.can_manage ? <button className="button" type="button" disabled={savingRole === role.role_key} onClick={() => void removeAssignment(role, assignment.assignment_id)}>Remove</button> : null}
                  </div>
                ))}
              </div> : null}

              {data.can_manage && !atLimit ? <div style={{ display: "grid", gridTemplateColumns: "minmax(240px, 1fr) auto", gap: 8 }}>
                <select value={selections[role.role_key] ?? ""} onChange={(event) => setSelections((current) => ({ ...current, [role.role_key]: event.target.value }))} aria-label={`Add ${role.role_label}`} style={{ minHeight: 42, border: "1px solid #cbd5e1", borderRadius: 10, padding: "0 10px", background: "#fff" }}>
                  <option value="">Select another person…</option>
                  {isOperator
                    ? (candidates as OperatorProfile[]).map((person) => <option key={person.profile_id} value={person.profile_id}>{person.display_name} — {person.email}</option>)
                    : (candidates as RosterPerson[]).map((person) => <option key={person.roster_member_id} value={person.roster_member_id}>{person.full_name}{person.worker_type ? ` · ${person.worker_type}` : ""}{person.email ? ` — ${person.email}` : ""}</option>)}
                </select>
                <button className="button button-primary" type="button" disabled={!selections[role.role_key] || savingRole === role.role_key} onClick={() => void addAssignment(role)}>{savingRole === role.role_key ? "Saving…" : "Add leader"}</button>
              </div> : null}
            </article>
          );
        })}
      </div>
      {!data.can_manage ? <p className="app-card__body" style={{ margin: 0 }}>You can view assignments. Company administrators can change them.</p> : null}
      {error ? <p style={{ color: "#b91c1c", margin: 0 }}>{error}</p> : null}
      {message ? <p style={{ color: "#047857", margin: 0 }}>{message}</p> : null}
    </section>
  );
}
