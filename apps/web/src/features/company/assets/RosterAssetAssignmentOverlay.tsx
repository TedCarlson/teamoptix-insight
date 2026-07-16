"use client";

import { useEffect, useMemo, useState } from "react";
import type { CompanyAssetRow } from "./asset.types";
import {
  assignAssetToRosterSlot,
  loadAssetsForAssignment,
  releaseAssetAssignment,
} from "./assetAssignment.client";

type Props = {
  open: boolean;
  companySlug: string;
  rosterMemberId: string;
  rosterMemberName: string;
  assetTypeKey: "SCANNER" | "FUEL_CARD" | "PIN";
  assetTypeLabel: string;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
};

export default function RosterAssetAssignmentOverlay({
  open,
  companySlug,
  rosterMemberId,
  rosterMemberName,
  assetTypeKey,
  assetTypeLabel,
  onClose,
  onChanged,
}: Props) {
  const [assets, setAssets] = useState<CompanyAssetRow[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentAsset =
    assets.find(
      (asset) =>
        asset.assigned_roster_member_id === rosterMemberId,
    ) ?? null;

  useEffect(() => {
    let active = true;

    async function load() {
      if (!open) return;

      setLoading(true);
      setError(null);
      setSearch("");

      try {
        const rows = await loadAssetsForAssignment(
          companySlug,
          assetTypeKey,
        );

        if (!active) return;

        setAssets(rows);

        const current = rows.find(
          (asset) =>
            asset.assigned_roster_member_id === rosterMemberId,
        );

        setSelectedAssetId(current?.asset_id ?? "");
      } catch (loadError) {
        if (!active) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load assets.",
        );
        setAssets([]);
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [
    open,
    companySlug,
    rosterMemberId,
    assetTypeKey,
  ]);

  const visibleAssets = useMemo(() => {
    const query = search.trim().toLowerCase();

    return assets.filter((asset) => {
      if (asset.assignment_muted) return false;

      if (!query) return true;

      return [
        asset.asset_identifier,
        asset.display_name,
        asset.status_label,
        asset.assigned_roster_member_name,
      ]
        .filter(Boolean)
        .some((value) =>
          String(value).toLowerCase().includes(query),
        );
    });
  }, [assets, search]);

  if (!open) return null;

  async function assign() {
    if (!selectedAssetId) return;

    setSaving(true);
    setError(null);

    try {
      await assignAssetToRosterSlot({
        companySlug,
        assetId: selectedAssetId,
        rosterMemberId,
      });

      await onChanged();
      onClose();
    } catch (assignError) {
      setError(
        assignError instanceof Error
          ? assignError.message
          : "Failed to assign asset.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function release() {
    if (!currentAsset) return;

    setSaving(true);
    setError(null);

    try {
      await releaseAssetAssignment({
        companySlug,
        assetId: currentAsset.asset_id,
      });

      await onChanged();
      onClose();
    } catch (releaseError) {
      setError(
        releaseError instanceof Error
          ? releaseError.message
          : "Failed to release asset.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 110,
        background: "rgba(15, 23, 42, 0.36)",
        display: "grid",
        placeItems: "center",
        padding: 16,
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`${assetTypeLabel} assignment`}
        onMouseDown={(event) => event.stopPropagation()}
        style={{
          width: "min(640px, 100%)",
          maxHeight: "calc(100vh - 32px)",
          overflow: "auto",
          background: "#fff",
          border: "1px solid #d6dfeb",
          borderRadius: 22,
          boxShadow: "0 24px 60px rgba(15,23,42,.22)",
          padding: 18,
          display: "grid",
          gap: 14,
        }}
      >
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div>
            <p className="workspace-eyebrow">
              Assigned resource
            </p>
            <h2
              className="workspace-card-title"
              style={{ fontSize: 21 }}
            >
              {assetTypeLabel}
            </h2>
            <p
              className="workspace-card-body"
              style={{ marginTop: 4 }}
            >
              Assign to {rosterMemberName}
            </p>
          </div>

          <button
            className="button"
            type="button"
            disabled={saving}
            onClick={onClose}
          >
            Close
          </button>
        </header>

        <div
          style={{
            border: "1px solid #e2e8f0",
            borderRadius: 14,
            padding: 12,
            display: "grid",
            gap: 5,
          }}
        >
          <span className="hero-stat__label">
            Current assignment
          </span>
          <strong>
            {currentAsset?.asset_identifier ?? "Unassigned"}
          </strong>
        </div>

        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={`Search ${assetTypeLabel.toLowerCase()} assets...`}
          style={{
            width: "100%",
            height: 40,
            borderRadius: 11,
            border: "1px solid #d6dfeb",
            padding: "0 11px",
          }}
        />

        <div
          style={{
            display: "grid",
            gap: 8,
            maxHeight: 320,
            overflowY: "auto",
          }}
        >
          {loading ? (
            <p className="workspace-card-body">
              Loading assets...
            </p>
          ) : visibleAssets.length === 0 ? (
            <p className="workspace-card-body">
              No matching assets are available.
            </p>
          ) : (
            visibleAssets.map((asset) => {
              const assignedElsewhere =
                asset.assigned_roster_member_id &&
                asset.assigned_roster_member_id !==
                  rosterMemberId;

              return (
                <label
                  key={asset.asset_id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "22px minmax(0, 1fr)",
                    gap: 10,
                    alignItems: "start",
                    border:
                      selectedAssetId === asset.asset_id
                        ? "1px solid #2563eb"
                        : "1px solid #e2e8f0",
                    borderRadius: 12,
                    padding: 11,
                    cursor: "pointer",
                    background:
                      selectedAssetId === asset.asset_id
                        ? "#eff6ff"
                        : "#fff",
                  }}
                >
                  <input
                    type="radio"
                    name={`asset-${assetTypeKey}`}
                    checked={
                      selectedAssetId === asset.asset_id
                    }
                    onChange={() =>
                      setSelectedAssetId(asset.asset_id)
                    }
                  />

                  <span
                    style={{ display: "grid", gap: 3 }}
                  >
                    <strong>
                      {asset.asset_identifier}
                    </strong>

                    <span
                      style={{
                        color: assignedElsewhere
                          ? "#9a3412"
                          : "#64748b",
                        fontSize: 12,
                      }}
                    >
                      {assignedElsewhere
                        ? `Currently assigned to ${asset.assigned_roster_member_name ?? "another driver"}`
                        : asset.assigned_roster_member_id ===
                            rosterMemberId
                          ? "Current assignment"
                          : asset.status_label}
                    </span>
                  </span>
                </label>
              );
            })
          )}
        </div>

        {error ? (
          <p style={{ color: "#b91c1c", margin: 0 }}>
            {error}
          </p>
        ) : null}

        <footer
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <div>
            {currentAsset ? (
              <button
                className="button"
                type="button"
                disabled={saving}
                onClick={release}
              >
                {saving ? "Saving..." : "Release"}
              </button>
            ) : null}
          </div>

          <button
            className="button button-primary"
            type="button"
            disabled={
              saving ||
              loading ||
              !selectedAssetId ||
              selectedAssetId === currentAsset?.asset_id
            }
            onClick={assign}
          >
            {saving
              ? "Saving..."
              : currentAsset
                ? "Change assignment"
                : "Assign asset"}
          </button>
        </footer>
      </section>
    </div>
  );
}
