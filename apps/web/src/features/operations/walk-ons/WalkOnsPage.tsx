"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { easternOperationalDayBounds } from "@/lib/operationalDay";
import styles from "./WalkOnsPage.module.css";

type WalkOnRow = {
  walk_on_driver_id: string;
  roster_member_id: string;
  full_name: string;
  dswid: string | null;
  workforce_unit_id: string | null;
  workforce_unit_name: string | null;
  first_seen_date: string;
  last_seen_date: string;
  dispatch_count: number;
  status: "ACTIVE" | "ARCHIVED";
};

type WorkforceUnit = {
  workforce_unit_id: string;
  unit_name: string;
};

type AssignmentRow = {
  assignment_id: string;
  roster_member_id: string;
  full_name: string;
  dswid: string | null;
  workforce_unit_name: string | null;
  service_date: string;
  assignment_status: "ACTIVE" | "REVERSED";
  note: string | null;
  payroll_event_id: string | null;
  payroll_event_status: string | null;
  pay_treatment: "ROSTER_RATE" | "ONE_DAY_RATE" | "INTERCOMPANY" | null;
  override_daily_pay_rate: number | null;
};

type EditDraft = {
  full_name: string;
  dswid: string;
  workforce_unit_id: string;
  status: "ACTIVE" | "ARCHIVED";
};

const inputStyle: React.CSSProperties = {
  minHeight: 38,
  border: "1px solid #d6dfeb",
  borderRadius: 10,
  background: "#fff",
  padding: "0 12px",
  font: "inherit",
};

const cellStyle: React.CSSProperties = {
  padding: "11px 10px",
  borderBottom: "1px solid #e6edf5",
  verticalAlign: "top",
  fontSize: 14,
};

function dateLabel(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function payLabel(assignment: AssignmentRow) {
  if (!assignment.payroll_event_id) return "Override required";
  if (assignment.pay_treatment === "ONE_DAY_RATE") {
    return `One-day · $${Number(assignment.override_daily_pay_rate ?? 0).toFixed(2)}`;
  }
  if (assignment.pay_treatment === "INTERCOMPANY") return "Intercompany";
  return "Roster rate";
}

export default function WalkOnsPage({ slug }: { slug: string }) {
  const today = easternOperationalDayBounds().operationalDate;
  const [walkOns, setWalkOns] = useState<WalkOnRow[]>([]);
  const [units, setUnits] = useState<WorkforceUnit[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [expandedRosterId, setExpandedRosterId] = useState<string | null>(null);
  const [editingRosterId, setEditingRosterId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDswid, setNewDswid] = useState("");
  const [newUnitId, setNewUnitId] = useState("");
  const [newUnitName, setNewUnitName] = useState("");
  const [serviceDate, setServiceDate] = useState(today);
  const [note, setNote] = useState("");
  const [payDrafts, setPayDrafts] = useState<
    Record<string, { rate: string; note: string }>
  >({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/company/${slug}/operations/walk-ons`, {
        credentials: "include",
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload?.error ?? "Failed to load walk-on operations.");
      }

      setWalkOns(Array.isArray(payload?.walk_ons) ? payload.walk_ons : []);
      setUnits(Array.isArray(payload?.workforce_units) ? payload.workforce_units : []);
      setAssignments(Array.isArray(payload?.assignments) ? payload.assignments : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load walk-ons.");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  const assignmentsByRoster = useMemo(() => {
    const result = new Map<string, AssignmentRow[]>();
    for (const assignment of assignments) {
      const current = result.get(assignment.roster_member_id) ?? [];
      current.push(assignment);
      result.set(assignment.roster_member_id, current);
    }
    return result;
  }, [assignments]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return walkOns.filter((row) => {
      if (!showArchived && row.status === "ARCHIVED") return false;
      if (!query) return true;
      return [row.full_name, row.dswid, row.workforce_unit_name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [search, showArchived, walkOns]);

  const activeCount = walkOns.filter((row) => row.status === "ACTIVE").length;
  const unitCount = new Set(
    walkOns.filter((row) => row.status === "ACTIVE").map((row) => row.workforce_unit_id)
  ).size;
  const currentMonthPrefix = today.slice(0, 7);
  const monthAssignmentCount = assignments.filter(
    (row) => row.assignment_status === "ACTIVE" && row.service_date.startsWith(currentMonthPrefix)
  ).length;
  const payrollReviewCount = assignments.filter(
    (row) => row.assignment_status === "ACTIVE" && !row.payroll_event_id
  ).length;

  async function addWalkOn(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(`/api/company/${slug}/operations/walk-ons`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          full_name: newName,
          dswid: newDswid,
          workforce_unit_id: newUnitId || null,
          new_workforce_unit_name: newUnitName || null,
          service_date: serviceDate,
          note,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error ?? "Failed to add walk-on.");

      setNewName("");
      setNewDswid("");
      setNewUnitId("");
      setNewUnitName("");
      setNote("");
      setShowCreateForm(false);
      setNotice("Walk-on identity and dated service assignment saved.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to add walk-on.");
    } finally {
      setSaving(false);
    }
  }

  function beginEdit(row: WalkOnRow) {
    setEditingRosterId(row.roster_member_id);
    setEditDraft({
      full_name: row.full_name,
      dswid: row.dswid ?? "",
      workforce_unit_id: row.workforce_unit_id ?? "",
      status: row.status,
    });
    setError(null);
    setNotice(null);
  }

  async function saveEdit() {
    if (!editingRosterId || !editDraft) return;
    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(`/api/company/${slug}/operations/walk-ons`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          roster_member_id: editingRosterId,
          ...editDraft,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error ?? "Failed to update walk-on.");

      setEditingRosterId(null);
      setEditDraft(null);
      setNotice("Walk-on roster row updated.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to update walk-on.");
    } finally {
      setSaving(false);
    }
  }

  async function submitPayOverride(assignment: AssignmentRow) {
    const draft = payDrafts[assignment.assignment_id] ?? { rate: "", note: "" };
    const rate = Number(draft.rate);

    if (!Number.isFinite(rate) || rate <= 0) {
      setError("Enter a positive one-day pay rate.");
      return;
    }
    if (!draft.note.trim()) {
      setError("Add a short reason or verification note for the pay override.");
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(`/api/company/${slug}/payroll/work-events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "create",
          roster_member_id: assignment.roster_member_id,
          service_date: assignment.service_date,
          event_type: "WALK_ON_DAY",
          pay_treatment: "ONE_DAY_RATE",
          override_daily_pay_rate: rate,
          note: draft.note,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.detail ?? payload?.error ?? "Failed to save pay override.");
      }

      setPayDrafts((current) => {
        const next = { ...current };
        delete next[assignment.assignment_id];
        return next;
      });
      setNotice(`One-day pay override saved for ${dateLabel(assignment.service_date)}.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to save pay override.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="workspace-shell operations-walk-ons">
      <section className={styles.page}>
        <header className={styles.briefingHeader}>
          <div>
            <p className="eyebrow">Operations · Workforce support</p>
            <h1>Walk Ons</h1>
            <p>Reusable support drivers and their dated service assignments.</p>
          </div>
          <div className={styles.headerActions}>
            <Link className="button" href={`/company/${slug}/payroll/summary`}>Payroll</Link>
            <button
              type="button"
              className="button button-primary"
              aria-expanded={showCreateForm}
              onClick={() => setShowCreateForm((current) => !current)}
            >
              {showCreateForm ? "Close" : "New assignment"}
            </button>
          </div>
        </header>

        <section className={styles.signalRail} aria-label="Walk-on operational signals">
          {[
            { label: "Active walk-ons", value: activeCount },
            { label: "Known units", value: unitCount },
            { label: "Assignments this month", value: monthAssignmentCount },
            { label: "Needs payroll", value: payrollReviewCount },
          ].map((signal) => (
            <div className={styles.signal} key={signal.label}>
              <span>{signal.label}</span>
              <strong>{signal.value}</strong>
            </div>
          ))}
        </section>

        {error ? <div role="alert" className="value-card" style={{ padding: 14, color: "#991b1b", fontWeight: 800 }}>{error}</div> : null}
        {notice ? <div role="status" className="value-card" style={{ padding: 14, color: "#166534", fontWeight: 800 }}>{notice}</div> : null}

        {showCreateForm ? (
          <section className="value-card" style={{ padding: "14px 16px" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <h2 className="value-card__title" style={{ fontSize: 18 }}>New walk-on assignment</h2>
              <span className="value-card__body">Creates or reuses the roster identity for the selected service date.</span>
            </div>
            <form onSubmit={addWalkOn} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(175px, 1fr))", gap: 9, alignItems: "end", marginTop: 10 }}>
              <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 750 }}><span>Driver name</span><input required value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Full name" style={inputStyle} /></label>
              <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 750 }}><span>Foreign DSWID</span><input required value={newDswid} onChange={(event) => setNewDswid(event.target.value)} placeholder="HEARNS,JAYLEN VIRGIL" style={inputStyle} /></label>
              <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 750 }}><span>Known unit</span><select value={newUnitId} onChange={(event) => setNewUnitId(event.target.value)} style={inputStyle}><option value="">Choose unit</option>{units.map((unit) => <option key={unit.workforce_unit_id} value={unit.workforce_unit_id}>{unit.unit_name}</option>)}</select></label>
              <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 750 }}><span>Or new unit</span><input value={newUnitName} onChange={(event) => setNewUnitName(event.target.value)} placeholder="Derwood" style={inputStyle} /></label>
              <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 750 }}><span>Service date</span><input type="date" required max={today} value={serviceDate} onChange={(event) => setServiceDate(event.target.value)} style={inputStyle} /></label>
              <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 750 }}><span>Note</span><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional" style={inputStyle} /></label>
              <button className="button button-primary" disabled={saving}>{saving ? "Saving…" : "Save assignment"}</button>
            </form>
          </section>
        ) : null}

        <section className="value-card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", padding: "14px 16px", borderBottom: "1px solid #e6edf5" }}>
            <div><p className="value-card__eyebrow">Walk-on roster</p><h2 className="value-card__title" style={{ fontSize: 19 }}>Support drivers</h2></div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search driver, DSWID, or unit" style={{ ...inputStyle, minWidth: 250 }} />
              <button type="button" className="button" aria-pressed={showArchived} onClick={() => setShowArchived((current) => !current)}>{showArchived ? "Hide archived" : "Show archived"}</button>
            </div>
          </div>

          {loading ? <p className="value-card__body" style={{ padding: 16 }}>Loading walk-ons…</p> : filteredRows.length === 0 ? <p className="value-card__body" style={{ padding: 16 }}>No walk-on rows match this view.</p> : (
            <div className="operations-family-table-wrap" style={{ overflowX: "auto" }}>
              <table className="operations-family-table" style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
                <thead><tr>{["Driver", "DSWID", "Workforce unit", "First / last service", "Days", "Status", "Actions"].map((label) => <th key={label} style={{ ...cellStyle, textAlign: "left", fontSize: 11, textTransform: "uppercase", color: "#64748b" }}>{label}</th>)}</tr></thead>
                <tbody>
                  {filteredRows.map((row) => {
                    const history = assignmentsByRoster.get(row.roster_member_id) ?? [];
                    const unresolvedPayCount = history.filter(
                      (item) =>
                        item.assignment_status === "ACTIVE" &&
                        !item.payroll_event_id
                    ).length;
                    const editing = editingRosterId === row.roster_member_id && editDraft;
                    const expanded = expandedRosterId === row.roster_member_id;
                    return (
                      <Fragment key={row.roster_member_id}>
                        <tr>
                          <td style={cellStyle}>{editing ? <input value={editDraft.full_name} onChange={(event) => setEditDraft({ ...editDraft, full_name: event.target.value })} style={inputStyle} /> : <strong>{row.full_name}</strong>}</td>
                          <td style={cellStyle}>{editing ? <input value={editDraft.dswid} onChange={(event) => setEditDraft({ ...editDraft, dswid: event.target.value })} style={inputStyle} /> : row.dswid || "—"}</td>
                          <td style={cellStyle}>{editing ? <select value={editDraft.workforce_unit_id} onChange={(event) => setEditDraft({ ...editDraft, workforce_unit_id: event.target.value })} style={inputStyle}><option value="">Choose unit</option>{units.map((unit) => <option key={unit.workforce_unit_id} value={unit.workforce_unit_id}>{unit.unit_name}</option>)}</select> : row.workforce_unit_name || "—"}</td>
                          <td style={cellStyle}>{dateLabel(row.first_seen_date)}<br /><span className="muted">{dateLabel(row.last_seen_date)}</span></td>
                          <td style={cellStyle}>{history.filter((item) => item.assignment_status === "ACTIVE").length}</td>
                          <td style={cellStyle}>{editing ? <select value={editDraft.status} onChange={(event) => setEditDraft({ ...editDraft, status: event.target.value as EditDraft["status"] })} style={inputStyle}><option value="ACTIVE">Active</option><option value="ARCHIVED">Archived</option></select> : row.status === "ACTIVE" ? "Active" : "Archived"}</td>
                          <td style={cellStyle}><div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{editing ? <><button type="button" className="button button-primary" disabled={saving} onClick={() => void saveEdit()}>Save</button><button type="button" className="button" onClick={() => { setEditingRosterId(null); setEditDraft(null); }}>Cancel</button></> : <><button type="button" className="button" onClick={() => beginEdit(row)}>Manage</button><button type="button" className={unresolvedPayCount > 0 ? "button button-primary" : "button"} onClick={() => setExpandedRosterId(expanded ? null : row.roster_member_id)}>{expanded ? "Hide history" : unresolvedPayCount > 0 ? `Review pay (${unresolvedPayCount})` : "History"}</button></>}</div></td>
                        </tr>
                        {expanded ? (
                          <tr><td colSpan={7} style={{ ...cellStyle, background: "#f8fafc" }}>
                            {history.length === 0 ? (
                              <span className="muted">No dated assignments.</span>
                            ) : (
                              <div style={{ display: "grid", gap: 8 }}>
                                {history.map((assignment) => {
                                  const draft = payDrafts[assignment.assignment_id] ?? {
                                    rate: "",
                                    note: "",
                                  };
                                  return (
                                    <div
                                      key={assignment.assignment_id}
                                      style={{
                                        display: "grid",
                                        gridTemplateColumns: "130px minmax(140px, .8fr) minmax(150px, .8fr) minmax(360px, 2fr)",
                                        gap: 12,
                                        alignItems: "center",
                                      }}
                                    >
                                      <strong>{dateLabel(assignment.service_date)}</strong>
                                      <span>{assignment.workforce_unit_name || "Unit missing"}</span>
                                      <span style={{ color: assignment.payroll_event_id ? "#166534" : "#b45309", fontWeight: 850 }}>
                                        {payLabel(assignment)}
                                      </span>
                                      {!assignment.payroll_event_id && assignment.assignment_status === "ACTIVE" ? (
                                        <div style={{ display: "grid", gridTemplateColumns: "120px minmax(180px, 1fr) auto", gap: 7 }}>
                                          <input
                                            type="number"
                                            min="0.01"
                                            step="0.01"
                                            aria-label={`One-day rate for ${assignment.service_date}`}
                                            placeholder="Rate"
                                            value={draft.rate}
                                            onChange={(event) => setPayDrafts((current) => ({
                                              ...current,
                                              [assignment.assignment_id]: { ...draft, rate: event.target.value },
                                            }))}
                                            style={inputStyle}
                                          />
                                          <input
                                            aria-label={`Pay note for ${assignment.service_date}`}
                                            placeholder="Verification note"
                                            value={draft.note}
                                            onChange={(event) => setPayDrafts((current) => ({
                                              ...current,
                                              [assignment.assignment_id]: { ...draft, note: event.target.value },
                                            }))}
                                            style={inputStyle}
                                          />
                                          <button
                                            type="button"
                                            className="button button-primary"
                                            disabled={saving}
                                            onClick={() => void submitPayOverride(assignment)}
                                          >
                                            Submit override
                                          </button>
                                        </div>
                                      ) : (
                                        <span className="muted">Payroll treatment recorded.</span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </td></tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
