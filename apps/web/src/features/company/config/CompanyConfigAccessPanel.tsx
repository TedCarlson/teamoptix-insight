"use client";

import { useEffect, useMemo, useState } from "react";
import { COMPANY_WORKSPACE_GRANTS, type CompanyWorkspaceGrantKey } from "./companyAccessModel";

type AccessPerson = {
  profile_id: string;
  display_name: string | null;
  email: string | null;
  relationship_type: string;
  membership_status: string;
  title: string | null;
  is_platform_owner?: boolean;
  grants: CompanyWorkspaceGrantKey[];
};

export default function CompanyConfigAccessPanel(props: { slug: string }) {
  const { slug } = props;

  const [people, setPeople] = useState<AccessPerson[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>("");
  const [draftGrants, setDraftGrants] = useState<Set<CompanyWorkspaceGrantKey>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedPerson = useMemo(
    () => people.find((person) => person.profile_id === selectedProfileId) ?? null,
    [people, selectedProfileId]
  );

  const groups = useMemo(
    () =>
      Array.from(
        COMPANY_WORKSPACE_GRANTS.reduce((map, grant) => {
          const rows = map.get(grant.group) ?? [];
          rows.push(grant);
          map.set(grant.group, rows);
          return map;
        }, new Map<string, typeof COMPANY_WORKSPACE_GRANTS>())
      ),
    []
  );

  async function loadAccess() {
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch(`/api/company/${slug}/config/access`, {
        cache: "no-store",
        credentials: "include",
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error ?? "Failed to load access config.");
        setPeople([]);
        return;
      }

      const rows = Array.isArray(data?.people)
        ? data.people.filter((person: AccessPerson) => !person.is_platform_owner)
        : [];
      setPeople(rows);

      const nextSelected = selectedProfileId || rows[0]?.profile_id || "";
      setSelectedProfileId(nextSelected);

      const selected = rows.find((row: AccessPerson) => row.profile_id === nextSelected) ?? rows[0] ?? null;
      setDraftGrants(new Set(Array.isArray(selected?.grants) ? selected.grants : []));
    } catch {
      setError("Failed to load access config.");
      setPeople([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (slug) void loadAccess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  function selectPerson(person: AccessPerson) {
    setSelectedProfileId(person.profile_id);
    setDraftGrants(new Set(Array.isArray(person.grants) ? person.grants : []));
    setMessage(null);
    setError(null);
  }

  function toggleGrant(grant: CompanyWorkspaceGrantKey) {
    setDraftGrants((current) => {
      const next = new Set(current);
      if (next.has(grant)) {
        next.delete(grant);
      } else {
        next.add(grant);
      }
      return next;
    });
  }

  async function saveGrants() {
    if (!selectedPerson) return;

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch(`/api/company/${slug}/config/access`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          profile_id: selectedPerson.profile_id,
          grants: Array.from(draftGrants),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error ?? "Failed to save grants.");
        return;
      }

      const rows = Array.isArray(data?.people)
        ? data.people.filter((person: AccessPerson) => !person.is_platform_owner)
        : [];
      setPeople(rows);
      const updated = rows.find((row: AccessPerson) => row.profile_id === selectedPerson.profile_id);
      setDraftGrants(new Set(Array.isArray(updated?.grants) ? updated.grants : []));
      setMessage("Workspace access saved.");
    } catch {
      setError("Failed to save grants.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <p className="app-card__body">
        Select a company user and choose the workspaces they can see and enter.
      </p>

      <section style={{ display: "grid", gridTemplateColumns: "280px minmax(0, 1fr)", gap: 12, alignItems: "start" }}>
        <aside style={{ display: "grid", gap: 8 }}>
          <strong style={{ fontSize: 13, color: "#334155" }}>Company users</strong>

          <div style={{ display: "grid", gap: 6 }}>
            {loading ? (
              <p className="app-card__body" style={{ margin: 0 }}>Loading users…</p>
            ) : people.length === 0 ? (
              <p className="app-card__body" style={{ margin: 0 }}>No company users found.</p>
            ) : (
              people.map((person) => {
                const active = person.profile_id === selectedProfileId;
                return (
                  <button
                    key={person.profile_id}
                    type="button"
                    className="button"
                    onClick={() => selectPerson(person)}
                    style={{
                      justifyContent: "flex-start",
                      textAlign: "left",
                      minHeight: 48,
                      borderColor: active ? "#2563eb" : undefined,
                      background: active ? "#eff6ff" : undefined,
                      color: active ? "#1d4ed8" : undefined,
                      fontWeight: active ? 900 : 750,
                    }}
                  >
                    <span style={{ display: "grid", gap: 2 }}>
                      <span>{person.display_name || person.email || "Unnamed user"}</span>
                      <small style={{ color: "#64748b" }}>
                        {person.relationship_type} · {person.membership_status}
                      </small>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <section style={{ display: "grid", gap: 10 }}>
          {selectedPerson ? (
            <>
              <div
                style={{
                  border: "1px solid #e6edf5",
                  borderRadius: 16,
                  background: "#fbfdff",
                  padding: 12,
                  display: "grid",
                  gap: 4,
                }}
              >
                <p className="value-card__eyebrow">Selected user</p>
                <strong>{selectedPerson.display_name || selectedPerson.email || "Unnamed user"}</strong>
                <span className="app-card__body" style={{ margin: 0 }}>
                  {selectedPerson.email || "No email"} · {selectedPerson.relationship_type}
                </span>
              </div>

              <div style={{ display: "grid", gap: 10 }}>
                {groups.map(([group, grants]) => (
                  <div
                    key={group}
                    style={{
                      border: "1px solid #e6edf5",
                      borderRadius: 14,
                      background: "#fff",
                      padding: 12,
                      display: "grid",
                      gap: 8,
                    }}
                  >
                    <strong style={{ color: "#334155", fontSize: 13 }}>{group}</strong>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
                      {grants.map((grant) => (
                        <label
                          key={grant.key}
                          style={{
                            display: "flex",
                            gap: 8,
                            alignItems: "flex-start",
                            border: "1px solid #d7e2ee",
                            borderRadius: 12,
                            padding: 10,
                            cursor: "pointer",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={draftGrants.has(grant.key)}
                            onChange={() => toggleGrant(grant.key)}
                            style={{ marginTop: 2 }}
                          />
                          <span style={{ display: "grid", gap: 2 }}>
                            <strong style={{ fontSize: 13 }}>{grant.label}</strong>
                            <small style={{ color: "#64748b" }}>{grant.description}</small>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="cta-row" style={{ marginTop: 0 }}>
                <button type="button" className="button button-primary" onClick={saveGrants} disabled={saving}>
                  {saving ? "Saving…" : "Save workspace access"}
                </button>
                <button type="button" className="button" onClick={loadAccess} disabled={saving}>
                  Refresh
                </button>
              </div>
            </>
          ) : (
            <p className="app-card__body">Select a company user to manage workspace access.</p>
          )}

          {message ? <p style={{ color: "#0f9f6e", margin: 0 }}>{message}</p> : null}
          {error ? <p style={{ color: "#c62828", margin: 0 }}>{error}</p> : null}
        </section>
      </section>
    </section>
  );
}
