"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { CompanyAssetRow } from "./asset.types";
import { useAssetConfig } from "./useAssetConfig";

type Props = {
  companySlug: string;
  assetTypeKey: string;
  assetTypeLabel: string;
  row: CompanyAssetRow | null;
  showSecondary?: boolean;
  onClose: () => void;
};

const inputStyle: React.CSSProperties = {
  height: 40,
  borderRadius: 10,
  border: "1px solid #d6dfeb",
  padding: "0 10px",
  background: "#fff",
};

export default function AssetEditDrawer(props: Props) {
  const router = useRouter();
  const isEdit = Boolean(props.row);
  const { providers, statuses, loading, error } = useAssetConfig(props.companySlug, props.assetTypeKey);

  const [assetIdentifier, setAssetIdentifier] = useState("");
  const [assetProviderId, setAssetProviderId] = useState("");
  const [statusKey, setStatusKey] = useState("AVAILABLE");
  const [secondaryIdentifier, setSecondaryIdentifier] = useState("");
  const [notes, setNotes] = useState("");
  const [assignmentMuted, setAssignmentMuted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setAssetIdentifier(props.row?.asset_identifier ?? "");
    setAssetProviderId(props.row?.asset_provider_id ?? "");
    setStatusKey(props.row?.status_key ?? "AVAILABLE");
    setSecondaryIdentifier(props.row?.secondary_identifier ?? "");
    setNotes(props.row?.notes ?? "");
    setAssignmentMuted(Boolean(props.row?.assignment_muted));
    setSaveError(null);
  }, [props.row]);

  async function save() {
    if (!assetIdentifier.trim()) {
      setSaveError("Asset identifier is required.");
      return;
    }

    setSaving(true);
    setSaveError(null);

    try {
      const res = await fetch(`/api/company/${props.companySlug}/assets/upsert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          asset_id: props.row?.asset_id ?? null,
          asset_type_key: props.assetTypeKey,
          asset_identifier: assetIdentifier,
          asset_status_key: statusKey,
          asset_provider_id: assetProviderId || null,
          secondary_identifier: secondaryIdentifier,
          notes,
          assignment_muted: assignmentMuted,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setSaveError(data?.detail ?? data?.error ?? "Failed to save asset.");
        return;
      }

      props.onClose();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      role="presentation"
      onClick={props.onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 90,
        background: "rgba(15, 23, 42, 0.28)",
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? "Edit asset" : "Add asset"}
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "min(520px, 100%)",
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
            <p className="value-card__eyebrow">{props.assetTypeLabel}</p>
            <h2 className="app-card__title" style={{ fontSize: 22 }}>
              {isEdit ? "Edit Asset" : "Add Asset"}
            </h2>
          </div>
          <button className="button" type="button" onClick={props.onClose}>Close</button>
        </div>

        <article className="app-card" style={{ padding: 14 }}>
          <div style={{ display: "grid", gap: 10 }}>
            <label style={{ display: "grid", gap: 5 }}>
              <span className="hero-stat__label">{props.assetTypeLabel} ID</span>
              <input value={assetIdentifier} onChange={(e) => setAssetIdentifier(e.target.value)} style={inputStyle} />
            </label>

            <label style={{ display: "grid", gap: 5 }}>
              <span className="hero-stat__label">Status</span>
              <select value={statusKey} onChange={(e) => setStatusKey(e.target.value)} style={inputStyle}>
                {statuses.map((status) => (
                  <option key={status.status_key} value={status.status_key}>
                    {status.status_label}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: "grid", gap: 5 }}>
              <span className="hero-stat__label">Provider</span>
              <select value={assetProviderId} onChange={(e) => setAssetProviderId(e.target.value)} style={inputStyle} disabled={loading}>
                <option value="">No provider</option>
                {providers.map((provider) => (
                  <option key={provider.asset_provider_id} value={provider.asset_provider_id}>
                    {provider.provider_label}
                  </option>
                ))}
              </select>
            </label>

            {props.showSecondary !== false ? (
              <label style={{ display: "grid", gap: 5 }}>
                <span className="hero-stat__label">PIN / Secondary</span>
                <input value={secondaryIdentifier} onChange={(e) => setSecondaryIdentifier(e.target.value)} style={inputStyle} />
              </label>
            ) : null}

            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" checked={assignmentMuted} onChange={(e) => setAssignmentMuted(e.target.checked)} />
              <span>Unavailable for assignment / managed outside roster</span>
            </label>

            <label style={{ display: "grid", gap: 5 }}>
              <span className="hero-stat__label">Notes</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={5}
                style={{
                  borderRadius: 12,
                  border: "1px solid #d6dfeb",
                  padding: 10,
                  resize: "vertical",
                }}
              />
            </label>

            {error ? <p style={{ color: "#c62828", margin: 0 }}>{error}</p> : null}
            {saveError ? <p style={{ color: "#c62828", margin: 0 }}>{saveError}</p> : null}

            <div className="cta-row" style={{ marginTop: 4 }}>
              <button className="button" type="button" onClick={props.onClose}>Cancel</button>
              <button className="button button-primary" type="button" disabled={saving || loading} onClick={save}>
                {saving ? "Saving..." : "Save asset"}
              </button>
            </div>
          </div>
        </article>
      </aside>
    </div>
  );
}
