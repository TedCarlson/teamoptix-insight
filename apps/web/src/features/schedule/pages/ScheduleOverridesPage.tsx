"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

type OverrideType = "CALL_OUT" | "TIME_OFF" | "ADD_IN";

type WorkerRow = {
  roster_member_id: string;
  full_name: string;
  worker_type: string | null;
};

type ScheduleRowResponse = {
  roster_member_id: string;
  full_name: string;
  role_label: string | null;
  role_bucket: "DRIVER_HELPER" | "OTHER";
};

type OverrideRow = {
  id: string;
  roster_member_id: string;
  override_type: OverrideType;
  start_date: string;
  end_date: string;
  is_active: boolean;
  created_at: string;
  full_name: string | null;
  worker_type: string | null;
};

type CommitResult = {
  generated_count?: number;
  override_count?: number;
  add_in_insert_count?: number;
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

const inputStyle: React.CSSProperties = {
  height: 42,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid #d6dfeb",
  background: "#fff",
  minWidth: 180,
};

const cellStyle: React.CSSProperties = {
  padding: "12px",
  borderBottom: "1px solid #e6edf5",
  verticalAlign: "top",
};

export default function ScheduleOverridesPage() {
  const params = useParams();
  const slug = String(params?.slug ?? "");

  const [workers, setWorkers] = useState<WorkerRow[]>([]);
  const [overrides, setOverrides] = useState<OverrideRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [rosterMemberId, setRosterMemberId] = useState("");
  const [overrideType, setOverrideType] = useState<OverrideType>("CALL_OUT");
  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState(todayIso());
  const [search, setSearch] = useState("");

  async function loadWorkers() {
    const res = await fetch(`/api/company/${slug}/schedule`, {
      credentials: "include",
      cache: "no-store",
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data?.error ?? "Failed to load workers.");
    }

    const rows = (data?.rows ?? []) as ScheduleRowResponse[];

    const mapped: WorkerRow[] = rows
      .map((row) => ({
        roster_member_id: row.roster_member_id,
        full_name: row.full_name,
        worker_type: row.role_label ?? null,
      }))
      .sort((a, b) => a.full_name.localeCompare(b.full_name));

    setWorkers(mapped);

    if (!rosterMemberId && mapped.length > 0) {
      setRosterMemberId(mapped[0].roster_member_id);
    }
  }

  async function loadOverrides() {
    const res = await fetch(`/api/company/${slug}/schedule/overrides`, {
      credentials: "include",
      cache: "no-store",
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data?.error ?? "Failed to load overrides.");
    }

    setOverrides((data?.rows ?? []) as OverrideRow[]);
  }

  async function refreshAll() {
    setLoading(true);
    setError(null);

    try {
      await Promise.all([loadWorkers(), loadOverrides()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load overrides.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!slug) return;
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  async function handleCreateOverride(e: React.FormEvent) {
    e.preventDefault();

    try {
      setBusy(true);
      setError(null);
      setMessage(null);

      const res = await fetch(`/api/company/${slug}/schedule/overrides`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          roster_member_id: rosterMemberId,
          override_type: overrideType,
          start_date: startDate,
          end_date: endDate,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error ?? "Failed to create override.");
        return;
      }

      const commit = (data?.commit ?? {}) as CommitResult;

      setMessage(
        `Override saved. Generated ${commit.generated_count ?? 0} rows, applied ${commit.override_count ?? 0} overrides, inserted ${commit.add_in_insert_count ?? 0} add-ins.`
      );

      await refreshAll();
    } catch {
      setError("Failed to create override.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveOverride(overrideId: string) {
    try {
      setBusy(true);
      setError(null);
      setMessage(null);

      const res = await fetch(
        `/api/company/${slug}/schedule/overrides/${overrideId}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error ?? "Failed to remove override.");
        return;
      }

      const commit = (data?.commit ?? {}) as CommitResult;

      setMessage(
        `Override removed. Generated ${commit.generated_count ?? 0} rows, applied ${commit.override_count ?? 0} overrides, inserted ${commit.add_in_insert_count ?? 0} add-ins.`
      );

      await refreshAll();
    } catch {
      setError("Failed to remove override.");
    } finally {
      setBusy(false);
    }
  }

  const filteredOverrides = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return overrides;

    return overrides.filter((row) => {
      return (
        (row.full_name ?? "").toLowerCase().includes(q) ||
        (row.worker_type ?? "").toLowerCase().includes(q) ||
        row.override_type.toLowerCase().includes(q) ||
        row.start_date.toLowerCase().includes(q) ||
        row.end_date.toLowerCase().includes(q)
      );
    });
  }, [overrides, search]);

  return (
    <main className="workspace-shell">
      <section
        style={{
          width: "min(1240px, calc(100% - 32px))",
          margin: "0 auto",
          padding: "24px 0 12px",
          display: "grid",
          gap: 12,
        }}
      >
        <div style={{ display: "grid", gap: 4 }}>
          <p
            className="eyebrow"
            style={{ margin: 0, fontSize: 12, letterSpacing: "0.08em" }}
          >
            Schedule
          </p>
          <h1 style={{ margin: 0, fontSize: 24, lineHeight: 1.05 }}>
            Overrides
          </h1>
        </div>
      </section>

      <section className="value-strip" style={{ paddingTop: 12 }}>
        <div className="value-grid">
          {error ? (
            <article className="value-card" style={{ gridColumn: "1 / -1" }}>
              <p style={{ color: "#c62828", margin: 0 }}>{error}</p>
            </article>
          ) : null}

          {message ? (
            <article className="value-card" style={{ gridColumn: "1 / -1" }}>
              <p style={{ color: "#0f9f6e", margin: 0, fontWeight: 600 }}>
                {message}
              </p>
            </article>
          ) : null}

          <article className="value-card" style={{ gridColumn: "1 / -1" }}>
            <p className="value-card__eyebrow">Create override</p>
            <h3 className="value-card__title">Manager exception entry</h3>

            <form
              onSubmit={handleCreateOverride}
              style={{
                marginTop: 14,
                display: "grid",
                gap: 12,
              }}
            >
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <select
                  value={rosterMemberId}
                  onChange={(e) => setRosterMemberId(e.target.value)}
                  style={inputStyle}
                  disabled={busy || loading}
                >
                  {workers.map((worker) => (
                    <option
                      key={worker.roster_member_id}
                      value={worker.roster_member_id}
                    >
                      {worker.full_name}
                      {worker.worker_type ? ` · ${worker.worker_type}` : ""}
                    </option>
                  ))}
                </select>

                <select
                  value={overrideType}
                  onChange={(e) =>
                    setOverrideType(e.target.value as OverrideType)
                  }
                  style={inputStyle}
                  disabled={busy}
                >
                  <option value="CALL_OUT">CALL_OUT</option>
                  <option value="TIME_OFF">TIME_OFF</option>
                  <option value="ADD_IN">ADD_IN</option>
                </select>

                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  style={inputStyle}
                  disabled={busy}
                />

                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  style={inputStyle}
                  disabled={busy}
                />
              </div>

              <div className="cta-row" style={{ marginTop: 0 }}>
                <button
                  type="submit"
                  className="button button-primary"
                  disabled={busy || loading || !rosterMemberId}
                >
                  {busy ? "Saving..." : "Save Override + Repaint"}
                </button>
              </div>
            </form>
          </article>

          <article className="value-card" style={{ gridColumn: "1 / -1" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <div>
                <p className="value-card__eyebrow">Active overrides</p>
                <h3 className="value-card__title">Current exception set</h3>
              </div>

              <input
                type="text"
                placeholder="Search worker, type, date..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={inputStyle}
              />
            </div>

            {loading ? (
              <div style={{ padding: "16px 0" }}>Loading overrides...</div>
            ) : filteredOverrides.length === 0 ? (
              <div style={{ padding: "16px 0" }}>No active overrides.</div>
            ) : (
              <div style={{ marginTop: 16, overflowX: "auto" }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    minWidth: 900,
                  }}
                >
                  <thead>
                    <tr>
                      {[
                        "Worker",
                        "Type",
                        "Start",
                        "End",
                        "Created",
                        "Actions",
                      ].map((label) => (
                        <th
                          key={label}
                          style={{
                            textAlign: "left",
                            padding: "10px 12px",
                            borderBottom: "1px solid #d6dfeb",
                            fontSize: 12,
                            letterSpacing: "0.04em",
                            textTransform: "uppercase",
                            color: "#5c6b84",
                          }}
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {filteredOverrides.map((row) => (
                      <tr key={row.id}>
                        <td style={cellStyle}>
                          <div style={{ fontWeight: 700 }}>
                            {row.full_name ?? "Unknown worker"}
                          </div>
                          <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                            {row.worker_type ?? "—"}
                          </div>
                        </td>
                        <td style={cellStyle}>{row.override_type}</td>
                        <td style={cellStyle}>{row.start_date}</td>
                        <td style={cellStyle}>{row.end_date}</td>
                        <td style={cellStyle}>
                          {new Date(row.created_at).toLocaleString()}
                        </td>
                        <td style={cellStyle}>
                          <button
                            type="button"
                            className="button"
                            disabled={busy}
                            onClick={() => handleRemoveOverride(row.id)}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>
        </div>
      </section>
    </main>
  );
}