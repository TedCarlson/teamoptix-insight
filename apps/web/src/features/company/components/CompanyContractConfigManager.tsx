"use client";

import { useEffect, useMemo, useState } from "react";

type ContractConfigRow = {
  id: string;
  company_id: string;
  contract_number: string;
  terminal_identity: string;
  service_area: string;
  effective_start_date: string;
  effective_end_date: string | null;
  status: string;
};

type Draft = {
  id?: string;
  contract_number: string;
  terminal_identity: string;
  service_area: string;
  effective_start_date: string;
  effective_end_date: string;
  status: string;
};

const emptyDraft: Draft = {
  contract_number: "",
  terminal_identity: "",
  service_area: "",
  effective_start_date: "",
  effective_end_date: "",
  status: "ACTIVE",
};

export default function CompanyContractConfigManager(props: {
  slug: string;
  canEdit: boolean;
}) {
  const { slug, canEdit } = props;

  const [rows, setRows] = useState<ContractConfigRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [saving, setSaving] = useState(false);

  const sortedRows = useMemo(
    () =>
      [...rows].sort((a, b) =>
        `${a.contract_number}-${a.service_area}`.localeCompare(
          `${b.contract_number}-${b.service_area}`
        )
      ),
    [rows]
  );

  async function loadRows() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/company/${slug}/config/contracts`, {
        cache: "no-store",
        credentials: "include",
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error ?? "Failed to load contract config.");
        setRows([]);
        return;
      }

      setRows(data?.rows ?? []);
    } catch {
      setError("Failed to load contract config.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    async function run() {
      await loadRows();
    }

    if (slug) void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  function openCreate() {
    setDraft(emptyDraft);
    setOverlayOpen(true);
  }

  function openEdit(row: ContractConfigRow) {
    setDraft({
      id: row.id,
      contract_number: row.contract_number ?? "",
      terminal_identity: row.terminal_identity ?? "",
      service_area: row.service_area ?? "",
      effective_start_date: row.effective_start_date ?? "",
      effective_end_date: row.effective_end_date ?? "",
      status: row.status ?? "ACTIVE",
    });
    setOverlayOpen(true);
  }

  async function saveDraft(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const isEdit = Boolean(draft.id);
      const res = await fetch(
        isEdit
          ? `/api/company/${slug}/config/contracts/${draft.id}`
          : `/api/company/${slug}/config/contracts`,
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            contract_number: draft.contract_number.trim(),
            terminal_identity: draft.terminal_identity.trim(),
            service_area: draft.service_area.trim(),
            effective_start_date: draft.effective_start_date,
            effective_end_date: draft.effective_end_date || null,
            status: draft.status || "ACTIVE",
          }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error ?? "Failed to save contract config.");
        return;
      }

      setOverlayOpen(false);
      setDraft(emptyDraft);
      await loadRows();
    } catch {
      setError("Failed to save contract config.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <p className="app-card__body">
        Add contract, terminal identity, and service area rows used to validate
        report ownership before warehouse persistence.
      </p>

      <div className="cta-row" style={{ marginTop: 0 }}>
        <button
          type="button"
          className="button button-primary"
          onClick={openCreate}
          disabled={!canEdit}
        >
          Add configuration
        </button>
        <button type="button" className="button" onClick={loadRows}>
          Refresh
        </button>
      </div>

      {error ? <p style={{ color: "#c62828", margin: 0 }}>{error}</p> : null}

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#64748b" }}>
              <th style={th}>Contract</th>
              <th style={th}>Terminal Identity</th>
              <th style={th}>Service Area</th>
              <th style={th}>Start</th>
              <th style={th}>End</th>
              <th style={th}>Status</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td style={td} colSpan={7}>Loading configuration…</td>
              </tr>
            ) : sortedRows.length === 0 ? (
              <tr>
                <td style={td} colSpan={7}>No contract configuration rows yet.</td>
              </tr>
            ) : (
              sortedRows.map((row) => (
                <tr key={row.id}>
                  <td style={td}><strong>{row.contract_number}</strong></td>
                  <td style={td}>{row.terminal_identity}</td>
                  <td style={td}>{row.service_area}</td>
                  <td style={td}>{row.effective_start_date}</td>
                  <td style={td}>{row.effective_end_date || "—"}</td>
                  <td style={td}>{row.status}</td>
                  <td style={td}>
                    <button
                      type="button"
                      className="button"
                      onClick={() => openEdit(row)}
                      disabled={!canEdit}
                      style={{ minHeight: 30, padding: "0 10px", fontSize: 12 }}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {overlayOpen ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 70,
            display: "grid",
            placeItems: "center",
            padding: 16,
            background: "rgba(15, 23, 42, 0.35)",
          }}
        >
          <form
            onSubmit={saveDraft}
            style={{
              width: "min(680px, 100%)",
              display: "grid",
              gap: 12,
              border: "1px solid #d6dfeb",
              borderRadius: 22,
              background: "#fff",
              padding: 18,
              boxShadow: "0 24px 60px rgba(15, 23, 42, 0.16)",
            }}
          >
            <div>
              <p className="value-card__eyebrow">Contract configuration</p>
              <h3 className="app-card__title">
                {draft.id ? "Edit configuration" : "Add configuration"}
              </h3>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 10,
              }}
            >
              <input
                required
                value={draft.contract_number}
                onChange={(e) =>
                  setDraft((current) => ({
                    ...current,
                    contract_number: e.target.value,
                  }))
                }
                placeholder="Contract number"
                style={inputStyle}
              />

              <input
                required
                value={draft.terminal_identity}
                onChange={(e) =>
                  setDraft((current) => ({
                    ...current,
                    terminal_identity: e.target.value,
                  }))
                }
                placeholder="Terminal identity"
                style={inputStyle}
              />

              <input
                required
                value={draft.service_area}
                onChange={(e) =>
                  setDraft((current) => ({
                    ...current,
                    service_area: e.target.value,
                  }))
                }
                placeholder="Service area"
                style={inputStyle}
              />

              <select
                value={draft.status}
                onChange={(e) =>
                  setDraft((current) => ({ ...current, status: e.target.value }))
                }
                style={inputStyle}
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="HISTORICAL">HISTORICAL</option>
              </select>

              <input
                required
                type="date"
                value={draft.effective_start_date}
                onChange={(e) =>
                  setDraft((current) => ({
                    ...current,
                    effective_start_date: e.target.value,
                  }))
                }
                style={inputStyle}
              />

              <input
                type="date"
                value={draft.effective_end_date}
                onChange={(e) =>
                  setDraft((current) => ({
                    ...current,
                    effective_end_date: e.target.value,
                  }))
                }
                style={inputStyle}
              />
            </div>

            <div className="cta-row" style={{ justifyContent: "flex-end" }}>
              <button
                type="button"
                className="button"
                onClick={() => {
                  setOverlayOpen(false);
                  setDraft(emptyDraft);
                }}
                disabled={saving}
              >
                Cancel
              </button>

              <button type="submit" className="button button-primary" disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

const th: React.CSSProperties = {
  padding: "8px 10px",
  borderBottom: "1px solid #e6edf5",
  whiteSpace: "nowrap",
};

const td: React.CSSProperties = {
  padding: "9px 10px",
  borderBottom: "1px solid #eef2f7",
  whiteSpace: "nowrap",
};

const inputStyle: React.CSSProperties = {
  height: 44,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid #d6dfeb",
  background: "#fff",
};
