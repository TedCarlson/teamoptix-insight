"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AssetAssignmentCell from "./AssetAssignmentCell";
import AssetStatusBadge from "./AssetStatusBadge";
import type { CompanyAssetRow } from "./asset.types";
import type { AssetDriverOption } from "./useCompanyRoster";

type Props = {
  row: CompanyAssetRow | null;
  drivers: AssetDriverOption[];
  driversLoading: boolean;
  assignedRosterMemberIds: Set<string>;
  showSecondary?: boolean;
  onEdit?: (row: CompanyAssetRow) => void;
  onClose: () => void;
};

function DetailRow(props: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <span className="hero-stat__label">{props.label}</span>
      <strong>{props.value || "—"}</strong>
    </div>
  );
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export default function AssetWorkspaceDrawer(props: Props) {
  const assetRow = props.row;
  const router = useRouter();
  const [notes, setNotes] = useState(assetRow?.notes ?? "");
  const [assignmentMuted, setAssignmentMuted] = useState(Boolean(assetRow?.assignment_muted));
  const [savingAdmin, setSavingAdmin] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);

  useEffect(() => {
    setNotes(assetRow?.notes ?? "");
    setAssignmentMuted(Boolean(assetRow?.assignment_muted));
    setAdminError(null);
  }, [assetRow?.asset_id, assetRow?.notes, assetRow?.assignment_muted]);

  if (!assetRow) return null;
  const row = assetRow;

  async function saveAdmin() {
    setSavingAdmin(true);
    setAdminError(null);

    try {
      const res = await fetch(`/api/company/${row.company_slug}/assets/admin-update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          asset_id: row.asset_id,
          notes,
          assignment_muted: assignmentMuted,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setAdminError(data?.detail ?? data?.error ?? "Failed to save asset.");
        return;
      }

      props.onClose();
      router.refresh();
    } finally {
      setSavingAdmin(false);
    }
  }

  return (
    <div
      role="presentation"
      onClick={props.onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "rgba(15, 23, 42, 0.28)",
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Asset workspace"
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "min(560px, 100%)",
          height: "100%",
          background: "#fff",
          boxShadow: "-20px 0 40px rgba(15, 23, 42, 0.18)",
          padding: 18,
          overflowY: "auto",
          display: "grid",
          alignContent: "start",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
          <div>
            <p className="value-card__eyebrow">Asset workspace</p>
            <h2 className="app-card__title" style={{ fontSize: 22 }}>{row.asset_identifier}</h2>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            {props.onEdit ? (
              <button className="button" type="button" onClick={() => props.onEdit?.(row)}>
                Edit
              </button>
            ) : null}
            <button className="button" type="button" onClick={props.onClose}>
              Close
            </button>
          </div>
        </div>

        <article className="app-card" style={{ padding: 14 }}>
          <p className="value-card__eyebrow">Overview</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
            <DetailRow label="Type" value={row.asset_type_label} />
            <DetailRow label="Status" value={<AssetStatusBadge label={row.assignment_muted ? "Unavailable for Assignment" : row.status_label} />} />
            <DetailRow label="Provider" value={row.provider ?? "—"} />
            {props.showSecondary !== false ? <DetailRow label="PIN / Secondary" value={row.secondary_identifier ?? "—"} /> : null}
            <DetailRow label="Assigned Driver" value={row.assigned_roster_member_name ?? "—"} />
            <DetailRow label="Updated" value={formatDate(row.updated_at)} />
          </div>
        </article>

        <article className="app-card" style={{ padding: 14 }}>
          <p className="value-card__eyebrow">Assignment</p>
          {assignmentMuted ? (
            <p className="app-card__body" style={{ marginTop: 8 }}>
              Assignment picker muted for this asset.
            </p>
          ) : (
            <AssetAssignmentCell
              row={row}
              drivers={props.drivers}
              driversLoading={props.driversLoading}
              assignedRosterMemberIds={props.assignedRosterMemberIds}
              onDone={props.onClose}
            />
          )}
        </article>

        <article className="app-card" style={{ padding: 14 }}>
          <p className="value-card__eyebrow">Admin notes</p>

          <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
            <input
              type="checkbox"
              checked={assignmentMuted}
              onChange={(event) => setAssignmentMuted(event.target.checked)}
            />
            <span>Unavailable for assignment / mute driver picker</span>
          </label>

          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Add note for this asset..."
            rows={5}
            style={{
              width: "100%",
              marginTop: 10,
              borderRadius: 12,
              border: "1px solid #d6dfeb",
              padding: 10,
              resize: "vertical",
            }}
          />

          {adminError ? <p style={{ color: "#c62828" }}>{adminError}</p> : null}

          <div className="cta-row" style={{ marginTop: 10 }}>
            <button className="button button-primary" type="button" disabled={savingAdmin} onClick={saveAdmin}>
              {savingAdmin ? "Saving..." : "Save asset note"}
            </button>
          </div>
        </article>
      </aside>
    </div>
  );
}
