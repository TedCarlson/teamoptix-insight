"use client";

import { Fragment, useMemo, useState } from "react";
import AssetStatusBadge from "./AssetStatusBadge";
import AssetEditDrawer from "./AssetEditDrawer";
import AssetWorkspaceDrawer from "./AssetWorkspaceDrawer";
import type { CompanyAssetRow } from "./asset.types";
import { useCompanyRoster } from "./useCompanyRoster";

type CompanyAssetsTableProps = {
  eyebrow: string;
  title: string;
  emptyLabel: string;
  rows: CompanyAssetRow[];
  showSecondary?: boolean;
  searchQuery?: string;
  assetLabel?: string;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function displayStatus(row: CompanyAssetRow) {
  return row.assignment_muted ? "Unavailable for Assignment" : row.status_label;
}

function statusSort(row: CompanyAssetRow) {
  if (row.assignment_muted) return 25;
  return row.status_sort_order ?? 999;
}

export default function CompanyAssetsTable(props: CompanyAssetsTableProps) {
  const [activeAsset, setActiveAsset] = useState<CompanyAssetRow | null>(null);
  const [editingAsset, setEditingAsset] = useState<CompanyAssetRow | null>(null);
  const [addingAsset, setAddingAsset] = useState(false);
  const [searchText, setSearchText] = useState(props.searchQuery ?? "");
  const companySlug = props.rows[0]?.company_slug ?? "";
  const { drivers, loading, error } = useCompanyRoster(companySlug);

  const assignedRosterMemberIds = useMemo(
    () =>
      new Set(
        props.rows
          .map((row) => row.assigned_roster_member_id)
          .filter((id): id is string => Boolean(id))
      ),
    [props.rows]
  );

  const visibleRows = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (q.length > 0 && q.length < 3) return props.rows;
    if (!q) return props.rows;

    return props.rows.filter((row) =>
      [
        row.asset_identifier,
        row.display_name,
        row.provider,
        row.secondary_identifier,
        row.notes,
        row.status_label,
        row.assignment_muted ? "Unavailable for Assignment" : "",
        row.assigned_roster_member_name,
        row.asset_type_label,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
    );
  }, [props.rows, searchText]);

  const groups = useMemo(() => {
    const byStatus = new Map<string, CompanyAssetRow[]>();

    for (const row of visibleRows) {
      const key = `${statusSort(row)}|${displayStatus(row)}`;
      byStatus.set(key, [...(byStatus.get(key) ?? []), row]);
    }

    return Array.from(byStatus.entries())
      .sort(([a], [b]) => Number(a.split("|")[0]) - Number(b.split("|")[0]))
      .map(([key, rows]) => ({
        key,
        label: key.split("|").slice(1).join("|"),
        rows,
      }));
  }, [visibleRows]);

  return (
    <>
      <article className="app-card" style={{ padding: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
          <div>
            <p className="value-card__eyebrow">{props.eyebrow}</p>
            <h2 className="app-card__title" style={{ fontSize: 18 }}>{props.title}</h2>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search assets..."
              style={{
                height: 38,
                width: 280,
                borderRadius: 12,
                border: "1px solid #d6dfeb",
                padding: "0 12px",
                background: "#fff",
              }}
            />
            {searchText ? (
              <button className="button" type="button" onClick={() => setSearchText("")}>
                Clear
              </button>
            ) : null}
            <button className="button button-primary" type="button" onClick={() => setAddingAsset(true)}>
              Add {props.assetLabel ?? "Asset"}
            </button>
          </div>
        </div>

        {error ? <p style={{ color: "#c62828", marginTop: 10 }}>{error}</p> : null}

        {props.rows.length === 0 ? (
          <p className="app-card__body" style={{ marginTop: 10 }}>{props.emptyLabel}</p>
        ) : (
          <div style={{ marginTop: 12, overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: 900, borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #d6dfeb", color: "#64748b", textAlign: "left" }}>
                  <th style={{ padding: "10px 10px", fontWeight: 700 }}>Driver</th>
                  <th style={{ padding: "10px 10px", fontWeight: 700 }}>Provider</th>
                  <th style={{ padding: "10px 10px", fontWeight: 700 }}>{props.assetLabel ?? "Asset"}</th>
                  {props.showSecondary !== false ? <th style={{ padding: "10px 10px", fontWeight: 700 }}>PIN</th> : null}
                  <th style={{ padding: "10px 10px", fontWeight: 700 }}>Status</th>
                  <th style={{ padding: "10px 10px", fontWeight: 700 }}>Notes</th>
                  <th style={{ padding: "10px 10px", fontWeight: 700 }}>Updated</th>
                </tr>
              </thead>

              <tbody>
                {groups.map((group) => (
                  <Fragment key={group.key}>
                    <tr key={`${group.key}-header`}>
                      <td colSpan={props.showSecondary !== false ? 7 : 6} style={{ padding: "10px 10px", background: "#f8fafc", borderTop: "1px solid #d6dfeb", borderBottom: "1px solid #d6dfeb", color: "#334155", fontWeight: 800 }}>
                        {group.label} · {group.rows.length}
                      </td>
                    </tr>

                    {group.rows.map((row) => (
                      <tr key={row.asset_id} onClick={() => setActiveAsset(row)} style={{ borderBottom: "1px solid #eef2f7", cursor: "pointer" }}>
                        <td style={{ padding: "10px 10px", verticalAlign: "top" }}><strong>{row.assigned_roster_member_name || "—"}</strong></td>
                        <td style={{ padding: "10px 10px", verticalAlign: "top" }}>{row.provider || "—"}</td>
                        <td style={{ padding: "10px 10px", verticalAlign: "top" }}>
                          <strong>{row.asset_identifier}</strong>
                          <div style={{ color: "#64748b", fontSize: 12 }}>{row.display_name || row.asset_type_label}</div>
                        </td>
                        {props.showSecondary !== false ? <td style={{ padding: "10px 10px", verticalAlign: "top" }}>{row.secondary_identifier || "—"}</td> : null}
                        <td style={{ padding: "10px 10px", verticalAlign: "top" }}><AssetStatusBadge label={displayStatus(row)} /></td>
                        <td style={{ padding: "10px 10px", verticalAlign: "top", color: "#64748b", maxWidth: 300 }}>{row.notes || "—"}</td>
                        <td style={{ padding: "10px 10px", verticalAlign: "top" }}>{formatDate(row.updated_at)}</td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>

      <AssetWorkspaceDrawer
        row={activeAsset}
        drivers={drivers}
        driversLoading={loading}
        assignedRosterMemberIds={assignedRosterMemberIds}
        showSecondary={props.showSecondary}
        onEdit={(row) => {
          setActiveAsset(null);
          setEditingAsset(row);
        }}
        onClose={() => setActiveAsset(null)}
      />

      {addingAsset ? (
        <AssetEditDrawer
          companySlug={companySlug}
          assetTypeKey={props.rows[0]?.asset_type_key ?? ""}
          assetTypeLabel={props.assetLabel ?? "Asset"}
          row={null}
          showSecondary={props.showSecondary}
          onClose={() => setAddingAsset(false)}
        />
      ) : null}

      {editingAsset ? (
        <AssetEditDrawer
          companySlug={companySlug}
          assetTypeKey={editingAsset.asset_type_key}
          assetTypeLabel={props.assetLabel ?? "Asset"}
          row={editingAsset}
          showSecondary={props.showSecondary}
          onClose={() => setEditingAsset(null)}
        />
      ) : null}
    </>
  );
}
