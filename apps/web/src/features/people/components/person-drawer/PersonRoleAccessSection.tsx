"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { RosterRow } from "@/features/people/types/roster.types";
import { getFedExRoleOptions } from "@/features/platform/roles/fedexRoleOptions";
import {
  COMPANY_WORKSPACE_GRANTS,
  type CompanyWorkspaceGrantKey,
} from "@/features/company/config/companyAccessModel";
import {
  getCompanyRoleAccessTemplate,
  leadershipLabel,
  type WorkforceLeadershipRoleKey,
} from "@/features/company/config/companyRoleAccessModel";
import { DrawerSection, compactInput } from "./PersonDrawerRows";

type RoleContext = {
  profile_id: string | null;
  role_label: string | null;
  is_linked: boolean;
  grants: CompanyWorkspaceGrantKey[];
  leadership_assignments: Array<{
    assignment_id: string;
    role_key: WorkforceLeadershipRoleKey;
    is_primary: boolean;
  }>;
};

type Props = {
  companySlug: string;
  person: RosterRow;
  onSaved: () => Promise<void>;
};

export default function PersonRoleAccessSection({ companySlug, person, onSaved }: Props) {
  const [context, setContext] = useState<RoleContext | null>(null);
  const [roleLabel, setRoleLabel] = useState(person.worker_type ?? "");
  const [leadershipRoleKey, setLeadershipRoleKey] = useState<WorkforceLeadershipRoleKey | null>(null);
  const [grants, setGrants] = useState<CompanyWorkspaceGrantKey[]>([]);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const applyContext = useCallback((next: RoleContext) => {
    setContext(next);
    setRoleLabel(next.role_label || person.worker_type || "");
    setLeadershipRoleKey(next.leadership_assignments[0]?.role_key ?? null);
    setGrants(Array.isArray(next.grants) ? next.grants : []);
  }, [person.worker_type]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/company/${companySlug}/people/roster/${person.roster_member_id}/role-access`,
        { cache: "no-store", credentials: "include" },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error ?? "Failed to load role and access.");
      applyContext(payload as RoleContext);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load role and access.");
    } finally {
      setLoading(false);
    }
  }, [applyContext, companySlug, person.roster_member_id]);

  useEffect(() => { void load(); }, [load]);

  const options = useMemo(
    () => getFedExRoleOptions(roleLabel).filter(
      (option) => !(person.employment_status === "Trainee" && option.value === "Driver"),
    ),
    [person.employment_status, roleLabel],
  );
  const grantSet = useMemo(() => new Set(grants), [grants]);

  function changeRole(nextRole: string) {
    const template = getCompanyRoleAccessTemplate(nextRole);
    setRoleLabel(nextRole);
    setLeadershipRoleKey(template.leadershipRoleKey);
    setGrants(context?.is_linked ? template.grants : []);
    setMessage(null);
  }

  function toggleGrant(grantKey: CompanyWorkspaceGrantKey) {
    setGrants((current) => current.includes(grantKey)
      ? current.filter((key) => key !== grantKey)
      : [...current, grantKey]);
  }

  async function persistRoleChange(options?: { promoteToDriver?: boolean }) {
    if (!context) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const promoteToDriver = options?.promoteToDriver === true;
      const nextRoleLabel = promoteToDriver ? "Driver" : roleLabel;
      const nextLeadershipRoleKey = promoteToDriver ? null : leadershipRoleKey;
      const nextGrants = promoteToDriver ? [] : grants;
      const response = await fetch(
        `/api/company/${companySlug}/people/roster/${person.roster_member_id}/role-access`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role_label: nextRoleLabel,
            leadership_role_key: nextLeadershipRoleKey,
            grants: nextGrants,
            promote_to_driver: promoteToDriver,
          }),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error ?? "Failed to update role and access.");
      applyContext(payload.context as RoleContext);
      setEditing(false);
      await onSaved();
      setMessage(
        promoteToDriver
          ? "Promoted to Driver. The standard rate begins on the selected first Driver day."
          : "Role, leadership, and workspace access updated together.",
      );
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to update role and access.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="app-card__body">Loading company role and access…</p>;
  }

  return (
    <DrawerSection
      eyebrow="Company responsibility"
      title="Role, leadership & access"
      editing={editing}
      saving={saving}
      onEdit={() => {
        if (editing && context) applyContext(context);
        setEditing((current) => !current);
        setError(null);
        setMessage(null);
      }}
    >
      {!editing ? (
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
            <div className="context-stat"><span className="context-stat__label">Company role</span><strong>{context?.role_label || "Not assigned"}</strong></div>
            <div className="context-stat"><span className="context-stat__label">Leadership</span><strong>{leadershipLabel(context?.leadership_assignments[0]?.role_key ?? null)}</strong></div>
            <div className="context-stat"><span className="context-stat__label">Workspace tools</span><strong>{context?.grants.length ?? 0}</strong></div>
          </div>
          {!context?.is_linked ? (
            <p style={{ margin: 0, color: "#92400e" }}>Invite this person to the app before assigning workspace tools. Their roster role and leadership responsibility can still be maintained.</p>
          ) : null}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
            <label style={{ display: "grid", gap: 5 }}>
              <span className="hero-stat__label">Company role</span>
              <select value={roleLabel} onChange={(event) => changeRole(event.target.value)} style={compactInput}>
                {!roleLabel ? <option value="">Select a role</option> : null}
                {options.map((option) => <option key={option.key} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label style={{ display: "grid", gap: 5 }}>
              <span className="hero-stat__label">Leadership responsibility</span>
              <select
                value={leadershipRoleKey ?? ""}
                onChange={(event) => setLeadershipRoleKey((event.target.value || null) as WorkforceLeadershipRoleKey | null)}
                style={compactInput}
              >
                <option value="">No leadership assignment</option>
                <option value="business_contact">Business Contact</option>
                <option value="assistant_bc">Assistant BC</option>
                <option value="fleet_manager">Fleet Manager</option>
                <option value="hr">HR</option>
              </select>
            </label>
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <div>
              <p className="workspace-eyebrow" style={{ margin: 0 }}>Workspace access</p>
              <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 12 }}>
                Selecting a role applies its recommended access. Review the list before saving.
              </p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 7 }}>
              {COMPANY_WORKSPACE_GRANTS.map((grant) => (
                <label key={grant.key} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: 8, border: "1px solid #e2e8f0", borderRadius: 10 }}>
                  <input
                    type="checkbox"
                    checked={grantSet.has(grant.key)}
                    disabled={!context?.is_linked}
                    onChange={() => toggleGrant(grant.key)}
                  />
                  <span style={{ display: "grid", gap: 2 }}>
                    <strong style={{ fontSize: 13 }}>{grant.label}</strong>
                    <small style={{ color: "#64748b" }}>{grant.description}</small>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              className="button button-primary"
              type="button"
              disabled={saving || !roleLabel}
              onClick={() => void persistRoleChange({
                promoteToDriver:
                  person.employment_status === "Trainee" && roleLabel === "Driver",
              })}
            >
              {saving ? "Saving…" : "Save role & access"}
            </button>
          </div>
        </div>
      )}

      {error ? <p style={{ margin: "8px 0 0", color: "#b91c1c" }}>{error}</p> : null}
      {message ? <p style={{ margin: "8px 0 0", color: "#047857" }}>{message}</p> : null}
    </DrawerSection>
  );
}
