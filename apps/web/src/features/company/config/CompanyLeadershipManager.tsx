"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Role = { role_key: string; role_label: string; description: string; roster_member_id: string | null; profile_id: string | null };
type RosterPerson = { roster_member_id: string; full_name: string; email: string | null };
type OperatorProfile = { profile_id: string; display_name: string; email: string };
type Payload = { can_manage: boolean; roles: Role[]; roster: RosterPerson[]; operator_profiles: OperatorProfile[] };

function visibleRole(role: Role): Role | null {
  if (role.role_key === "operations_support") return null;
  if (role.role_key === "hr") {
    return {
      ...role,
      description: "Owner of workforce administration and the default responsible party for candidate interview availability and follow-up.",
    };
  }
  if (role.role_key === "dispatch_coordinator") {
    return {
      ...role,
      role_label: "HR",
      description: "Owner of workforce administration, employee support, and people operations.",
    };
  }
  return role;
}

export default function CompanyLeadershipManager({ slug }: { slug: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingRole, setSavingRole] = useState<string | null>(null);
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

  const roles = useMemo(
    () => data?.roles.map(visibleRole).filter((role): role is Role => role !== null) ?? [],
    [data]
  );
  const assignedCount = useMemo(
    () => roles.filter((role) => Boolean(role.profile_id || role.roster_member_id)).length,
    [roles]
  );

  async function assign(role: Role, selectedId: string) {
    const isOperator = role.role_key === "authorized_operator";
    setSavingRole(role.role_key);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/company/${slug}/config/leadership`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          role_key: role.role_key,
          roster_member_id: isOperator ? null : selectedId || null,
          profile_id: isOperator ? selectedId || null : null,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error ?? "Failed to update leadership.");
      setData(payload);
      setMessage(`${role.role_label} updated.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to update leadership.");
    } finally {
      setSavingRole(null);
    }
  }

  if (loading) return <p className="app-card__body">Loading leadership assignments…</p>;
  if (!data) return (
    <div style={{ display: "grid", gap: 10 }}>
      <p style={{ color: "#b91c1c", margin: 0 }}>{error ?? "Leadership is unavailable."}</p>
      <button type="button" className="button" onClick={() => void load()}>Try again</button>
    </div>
  );

  return (
    <section style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
        <div className="context-stat"><span className="context-stat__label">Assigned</span><strong>{assignedCount}</strong></div>
        <div className="context-stat"><span className="context-stat__label">Open</span><strong>{roles.length - assignedCount}</strong></div>
        <div className="context-stat"><span className="context-stat__label">Leadership roles</span><strong>{roles.length}</strong></div>
      </div>

      <div style={{ border: "1px solid #bfdbfe", background: "#eff6ff", borderRadius: 12, padding: 12, color: "#1e3a8a", fontSize: 13 }}>
        The Authorized Operator is linked to the owner&apos;s company app profile. Workforce leaders are linked to roster members. HR is the default interview owner; Business Contact is used when HR is open or not linked to an app profile. Workspace permissions remain separate under Access.
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {roles.map((role) => {
          const isOperator = role.role_key === "authorized_operator";
          const assignedId = isOperator ? role.profile_id : role.roster_member_id;
          return (
            <article key={role.role_key} style={{ display: "grid", gridTemplateColumns: "minmax(220px, .9fr) minmax(260px, 1.1fr)", gap: 16, alignItems: "center", border: "1px solid #e2e8f0", borderRadius: 14, padding: 12, background: "#fff" }}>
              <div style={{ display: "grid", gap: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <strong>{role.role_label}</strong>
                  <span style={{ borderRadius: 999, padding: "2px 8px", fontSize: 11, fontWeight: 800, color: assignedId ? "#166534" : "#92400e", background: assignedId ? "#dcfce7" : "#fef3c7" }}>
                    {assignedId ? "Assigned" : "Open"}
                  </span>
                </div>
                <span style={{ color: "#64748b", fontSize: 12 }}>{role.description}</span>
                <span style={{ color: "#475569", fontSize: 11, fontWeight: 700 }}>{isOperator ? "Company app profile" : "Workforce roster"}</span>
              </div>
              <label style={{ display: "grid", gap: 5 }}>
                <span style={{ color: "#475569", fontSize: 12, fontWeight: 800 }}>{isOperator ? "Operator / owner profile" : "Roster member"}</span>
                <select
                  value={assignedId ?? ""}
                  onChange={(event) => void assign(role, event.target.value)}
                  disabled={!data.can_manage || savingRole === role.role_key}
                  aria-label={`Assign ${role.role_label}`}
                  style={{ minHeight: 42, border: "1px solid #cbd5e1", borderRadius: 10, padding: "0 10px", background: data.can_manage ? "#fff" : "#f8fafc" }}
                >
                  <option value="">Open — no assignment</option>
                  {isOperator
                    ? data.operator_profiles.map((person) => <option key={person.profile_id} value={person.profile_id}>{person.display_name} — {person.email}</option>)
                    : data.roster.map((person) => <option key={person.roster_member_id} value={person.roster_member_id}>{person.full_name}{person.email ? ` — ${person.email}` : ""}</option>)}
                </select>
              </label>
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
