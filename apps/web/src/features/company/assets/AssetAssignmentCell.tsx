"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CompanyAssetRow } from "./asset.types";
import type { AssetDriverOption } from "./useCompanyRoster";

type Props = {
  row: CompanyAssetRow;
  drivers: AssetDriverOption[];
  driversLoading: boolean;
  assignedRosterMemberIds: Set<string>;
  onDone?: () => void;
};

export default function AssetAssignmentCell({
  row,
  drivers,
  driversLoading,
  assignedRosterMemberIds,
  onDone,
}: Props) {
  const router = useRouter();
  const [selectedRosterId, setSelectedRosterId] = useState(row.assigned_roster_member_id ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unchanged = selectedRosterId === (row.assigned_roster_member_id ?? "");

  if (row.assignment_muted) {
    return (
      <div style={{ display: "grid", gap: 6 }}>
        <strong>{row.assigned_roster_member_name ?? "—"}</strong>
        <span style={{ color: "#64748b", fontSize: 12 }}>
          Assignment unavailable for this asset.
        </span>
      </div>
    );
  }

  const availableDrivers = drivers.filter((driver) => {
    if (driver.roster_member_id === row.assigned_roster_member_id) return true;
    return !assignedRosterMemberIds.has(driver.roster_member_id);
  });

  async function assign() {
    if (!row.company_slug || !selectedRosterId) return;

    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/company/${row.company_slug}/assets/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          asset_id: row.asset_id,
          roster_member_id: selectedRosterId,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.detail ?? data?.error ?? "Failed to assign.");
        return;
      }

      onDone?.();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function release() {
    if (!row.company_slug) return;

    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/company/${row.company_slug}/assets/release`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          asset_id: row.asset_id,
          release_reason: "RELEASED",
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.detail ?? data?.error ?? "Failed to release.");
        return;
      }

      setSelectedRosterId("");
      onDone?.();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <strong>{row.assigned_roster_member_name ?? "—"}</strong>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <select
          value={selectedRosterId}
          disabled={saving || driversLoading}
          onChange={(event) => setSelectedRosterId(event.target.value)}
          style={{
            minWidth: 190,
            height: 34,
            borderRadius: 10,
            border: "1px solid #d6dfeb",
            padding: "0 8px",
            background: "#fff",
          }}
        >
          <option value="">{driversLoading ? "Loading..." : "Select active driver"}</option>
          {availableDrivers.map((driver) => (
            <option key={driver.roster_member_id} value={driver.roster_member_id}>
              {driver.full_name}
            </option>
          ))}
        </select>

        <button
          className="button button-primary"
          type="button"
          disabled={saving || !selectedRosterId || unchanged}
          onClick={assign}
          style={{ padding: "7px 10px" }}
        >
          {saving ? "Saving..." : "Assign"}
        </button>

        {row.assigned_roster_member_id ? (
          <button
            className="button"
            type="button"
            disabled={saving}
            onClick={release}
            style={{ padding: "7px 10px" }}
          >
            Release
          </button>
        ) : null}
      </div>

      {error ? <span style={{ color: "#c62828", fontSize: 12 }}>{error}</span> : null}
    </div>
  );
}
