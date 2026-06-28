"use client";

import { useMemo, useState } from "react";
import AssetStatusBadge from "./AssetStatusBadge";
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

export default function CompanyAssetsTable(props: CompanyAssetsTableProps) {
  const [activeAsset, setActiveAsset] = useState<CompanyAssetRow | null>(null);
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



  return (
    <>
      <article className="app-card" style={{ padding: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
          <div>
            <p className="value-card__eyebrow">{props.eyebrow}</p>
            <h2 className="app-card__title" style={{ fontSize: 18 }}>{props.title}</h2>
          </div>

          <form method="GET" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              name="q"
              defaultValue={props.searchQuery ?? ""}
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
            <button className="button" type="submit">Search</button>
            {props.searchQuery ? (
              <a className="button" href="?">Clear</a>
            ) : null}
          </form>
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
                {props.rows.map((row) => (
                  <tr
                    key={row.asset_id}
                    onClick={() => setActiveAsset(row)}
                    style={{
                      borderBottom: "1px solid #eef2f7",
                      cursor: "pointer",
                    }}
                  >
                    <td style={{ padding: "10px 10px", verticalAlign: "top" }}>
                      <strong>{row.assigned_roster_member_name || "—"}</strong>
                    </td>

                    <td style={{ padding: "10px 10px", verticalAlign: "top" }}>
                      {row.provider || "—"}
                    </td>

                    <td style={{ padding: "10px 10px", verticalAlign: "top" }}>
                      <strong>{row.asset_identifier}</strong>
                      <div style={{ color: "#64748b", fontSize: 12 }}>
                        {row.display_name || row.asset_type_label}
                      </div>
                    </td>

                    {props.showSecondary !== false ? (
                      <td style={{ padding: "10px 10px", verticalAlign: "top" }}>
                        {row.secondary_identifier || "—"}
                      </td>
                    ) : null}

                    <td style={{ padding: "10px 10px", verticalAlign: "top" }}>
                      <AssetStatusBadge label={row.assignment_muted ? "Unavailable for Assignment" : row.status_label} />
                    </td>

                    <td style={{ padding: "10px 10px", verticalAlign: "top", color: "#64748b", maxWidth: 300 }}>
                      {row.notes || "—"}
                    </td>

                    <td style={{ padding: "10px 10px", verticalAlign: "top" }}>
                      {formatDate(row.updated_at)}
                    </td>
                  </tr>
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
        onClose={() => setActiveAsset(null)}
      />
    </>
  );
}
