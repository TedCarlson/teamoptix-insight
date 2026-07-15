"use client";

import { useCallback, useEffect, useState } from "react";

type WorkOrderRow = {
  id: string;
  template_name: string;
  operational_contract: string;
  cook_key: string;
  artifact_keys: string[];
  generation_mode: string;
  cadence_minutes: number | null;
  start_time: string | null;
  end_time: string | null;
  active_start_date: string;
  inactive_end_date: string | null;
  release_order: number;
  assignment_status: string;
  is_enabled: boolean;
  last_generated_at: string | null;
};

function human(value: string) {
  return value.toLowerCase().split("_").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ");
}

export default function CompanyWorkOrderControlTable(props: { slug: string; canEdit: boolean }) {
  const [rows, setRows] = useState<WorkOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/company/${props.slug}/automation/work-orders`,
        { cache: "no-store" },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Unable to load work orders.");
      }
      setRows(payload.work_orders || []);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to load work orders.",
      );
    } finally {
      setLoading(false);
    }
  }, [props.slug]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(row: WorkOrderRow) {
    setSavingId(row.id);
    setError(null);
    try {
      const response = await fetch(`/api/company/${props.slug}/automation/work-orders`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: row.id,
          assignment_status: row.assignment_status,
          is_enabled: row.is_enabled,
          inactive_end_date: row.inactive_end_date,
          release_order: row.release_order,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to update work order.");
      await load();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to update work order.");
    } finally {
      setSavingId(null);
    }
  }

  if (loading) return <p className="app-card__body">Loading standing work orders…</p>;

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div>
        <p className="value-card__eyebrow">Company table</p>
        <h3 className="app-card__title" style={{ fontSize: 18 }}>Standing Work Orders</h3>
        <p className="app-card__body">These are the current automation contracts Team Optix shipped to this company. Open end dates remain active until explicitly closed.</p>
      </div>

      {error ? <p style={{ color: "#b42318", margin: 0 }}>{error}</p> : null}

      <div className="operations-table-wrap">
        <table className="operations-table">
          <thead><tr><th>Order</th><th>Contract</th><th>Cook</th><th>Collection</th><th>Schedule</th><th>Effective</th><th>Control</th></tr></thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={7}>No standing work orders have been shipped to this company.</td></tr> : rows.map((row, index) => (
              <tr key={row.id}>
                <td>
                  {props.canEdit ? <input type="number" min="1" value={row.release_order} onChange={(event) => setRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, release_order: Number(event.target.value) } : item))} style={{ width: 64 }} /> : row.release_order}
                </td>
                <td><strong>{human(row.operational_contract)}</strong><br /><span>{row.template_name}</span></td>
                <td>{human(row.cook_key)}</td>
                <td>{row.artifact_keys?.length ? row.artifact_keys.map(human).join(" · ") : "Recipe defaults"}</td>
                <td>{row.generation_mode === "scheduled" ? `${row.cadence_minutes ? `Every ${row.cadence_minutes} min` : "Scheduled"}${row.start_time && row.end_time ? ` · ${row.start_time.slice(0, 5)}–${row.end_time.slice(0, 5)}` : ""}` : human(row.generation_mode)}</td>
                <td>{row.active_start_date} → {props.canEdit ? <input type="date" value={row.inactive_end_date || ""} onChange={(event) => setRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, inactive_end_date: event.target.value || null } : item))} /> : row.inactive_end_date || "Open"}</td>
                <td>
                  {props.canEdit ? (
                    <div style={{ display: "grid", gap: 6, minWidth: 130 }}>
                      <select value={row.assignment_status} onChange={(event) => setRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, assignment_status: event.target.value } : item))}>
                        <option value="draft">Draft</option><option value="ready">Ready</option><option value="active">Active</option><option value="paused">Paused</option><option value="retired">Retired</option>
                      </select>
                      <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={row.is_enabled} onChange={(event) => setRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, is_enabled: event.target.checked } : item))} /> Enabled</label>
                      <button type="button" onClick={() => void save(row)} disabled={savingId === row.id}>{savingId === row.id ? "Saving…" : "Update"}</button>
                    </div>
                  ) : `${human(row.assignment_status)}${row.is_enabled ? " · Enabled" : ""}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
