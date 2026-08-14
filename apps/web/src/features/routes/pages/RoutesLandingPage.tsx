"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import RouteDraftEditor, {
  type RouteDraft,
} from "@/features/routes/components/RouteDraftEditor";

type RouteGridRow = {
  id: string;
  route_name: string;
  current_wa_num: string | null;
  threshold_stops: number | null;
  threshold_rate: number | null;
  route_location: string | null;
  route_type: string;
  runs_s: boolean;
  runs_u: boolean;
  runs_m: boolean;
  runs_t: boolean;
  runs_w: boolean;
  runs_h: boolean;
  runs_f: boolean;
  rotation_name: string | null;
  is_active: boolean;
};

const EMPTY_DRAFT: RouteDraft = {
  route_name: "",
  current_wa_num: "",
  threshold_stops: "",
  threshold_rate: "",
  route_location: "",
  route_type: "CORE",
  runs_s: true,
  runs_u: true,
  runs_m: true,
  runs_t: true,
  runs_w: true,
  runs_h: true,
  runs_f: true,
  rotation_name: "",
  is_active: true,
};

function formatRouteType(value: string) {
  if (!value) return "";
  return value.charAt(0) + value.slice(1).toLowerCase();
}

function dayCell(active: boolean) {
  return (
    <span
      className="routes-day-pill"
      data-active={active}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 30,
        height: 24,
        padding: "0 8px",
        borderRadius: 999,
        border: `1px solid ${active ? "#7bc48a" : "#d6dfeb"}`,
        background: active ? "#e8f6eb" : "#f8fafc",
        color: active ? "#2f8f46" : "#64748b",
        fontSize: 10,
        fontWeight: 700,
        lineHeight: 1,
        whiteSpace: "nowrap",
      }}
    >
      {active ? "YES" : "—"}
    </span>
  );
}

const inputStyle: React.CSSProperties = {
  height: 40,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid #d6dfeb",
  background: "#fff",
};

const cellStyle: React.CSSProperties = {
  padding: "10px 10px",
  borderBottom: "1px solid #e6edf5",
  verticalAlign: "middle",
  background: "#fff",
};

const compactCellStyle: React.CSSProperties = {
  padding: "8px 2px",
  borderBottom: "1px solid #e6edf5",
  verticalAlign: "middle",
  textAlign: "center",
  background: "#fff",
};

const headerBaseStyle: React.CSSProperties = {
  borderBottom: "1px solid #d6dfeb",
  fontSize: 12,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "#5c6b84",
  verticalAlign: "middle",
  position: "sticky",
  top: 0,
  zIndex: 2,
  background: "#fff",
};

const headerStyle: React.CSSProperties = {
  ...headerBaseStyle,
  textAlign: "left",
  padding: "10px 10px",
};

const headerStyleCompact: React.CSSProperties = {
  ...headerBaseStyle,
  textAlign: "center",
  padding: "10px 2px",
};

export default function RoutesLandingPage() {
  const params = useParams();
  const slug = String(params?.slug ?? "");

  const [rows, setRows] = useState<RouteGridRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [rotationFilter, setRotationFilter] = useState("ALL");
  const [showThresholds, setShowThresholds] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"create" | "edit">("create");
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadRoutes() {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch(`/api/company/${slug}/routes`, {
        credentials: "include",
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error ?? "Failed to load routes.");
        setRows([]);
        return;
      }

      setRows((data?.routes ?? []) as RouteGridRow[]);
    } catch {
      setError("Failed to load routes.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (slug) loadRoutes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const rotationOptions = useMemo(() => {
    const values = Array.from(
      new Set(
        rows
          .map((row) => row.rotation_name?.trim())
          .filter((value): value is string => Boolean(value))
      )
    ).sort();

    return values;
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();

    return rows.filter((row) => {
      const matchesSearch =
        !q ||
        row.route_name.toLowerCase().includes(q) ||
        (row.current_wa_num ?? "").toLowerCase().includes(q) ||
        (row.route_location ?? "").toLowerCase().includes(q) ||
        row.route_type.toLowerCase().includes(q) ||
        (row.rotation_name ?? "").toLowerCase().includes(q);

      const matchesType =
        typeFilter === "ALL" || row.route_type.toUpperCase() === typeFilter;

      const matchesRotation =
        rotationFilter === "ALL"
          ? true
          : rotationFilter === "__NONE__"
            ? !row.rotation_name
            : row.rotation_name === rotationFilter;

      return matchesSearch && matchesType && matchesRotation;
    });
  }, [rows, search, typeFilter, rotationFilter]);

  const selectedRow = useMemo(
    () => rows.find((row) => row.id === selectedRouteId) ?? null,
    [rows, selectedRouteId]
  );

  const editorDraft = useMemo<RouteDraft>(() => {
    if (editorMode === "create" || !selectedRow) return EMPTY_DRAFT;

    return {
      route_name: selectedRow.route_name,
      current_wa_num: selectedRow.current_wa_num ?? "",
      threshold_stops:
        selectedRow.threshold_stops != null
          ? String(selectedRow.threshold_stops)
          : "",
      threshold_rate:
        selectedRow.threshold_rate != null
          ? String(selectedRow.threshold_rate)
          : "",
      route_location: selectedRow.route_location ?? "",
      route_type: selectedRow.route_type,
      runs_s: selectedRow.runs_s,
      runs_u: selectedRow.runs_u,
      runs_m: selectedRow.runs_m,
      runs_t: selectedRow.runs_t,
      runs_w: selectedRow.runs_w,
      runs_h: selectedRow.runs_h,
      runs_f: selectedRow.runs_f,
      rotation_name: selectedRow.rotation_name ?? "",
      is_active: selectedRow.is_active,
    };
  }, [editorMode, selectedRow]);

  function resetDraftState() {
    setAddOpen(false);
    setSelectedRouteId(null);
    setEditorMode("create");
  }

  function openCreate() {
    setSelectedRouteId(null);
    setEditorMode("create");
    setAddOpen(true);
  }

  function openEdit(routeId: string) {
    setAddOpen(false);
    setEditorMode("edit");
    setSelectedRouteId((current) => (current === routeId ? null : routeId));
  }

  function closeAddEditor() {
    if (busy) return;
    setAddOpen(false);
  }

  function closeInlineEditor() {
    if (busy) return;
    setSelectedRouteId(null);
  }

  async function refreshAfterSave() {
    resetDraftState();
    await loadRoutes();
  }

  async function handleCreate(draft: RouteDraft) {
    try {
      setBusy(true);
      setError(null);

      const res = await fetch(`/api/company/${slug}/routes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(draft),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error ?? "Failed to create route.");
        return;
      }

      await refreshAfterSave();
    } catch {
      setError("Failed to create route.");
    } finally {
      setBusy(false);
    }
  }

  async function handleEdit(draft: RouteDraft) {
    if (!selectedRouteId) return;

    try {
      setBusy(true);
      setError(null);

      const res = await fetch(
        `/api/company/${slug}/routes/${selectedRouteId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(draft),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error ?? "Failed to update route.");
        return;
      }

      await refreshAfterSave();
    } catch {
      setError("Failed to update route.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeactivate() {
    if (!selectedRouteId || !selectedRow) return;

    try {
      setBusy(true);
      setError(null);

      const res = await fetch(
        `/api/company/${slug}/routes/${selectedRouteId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            route_name: selectedRow.route_name,
            current_wa_num: selectedRow.current_wa_num ?? "",
            threshold_stops:
              selectedRow.threshold_stops != null
                ? String(selectedRow.threshold_stops)
                : "",
            threshold_rate:
              selectedRow.threshold_rate != null
                ? String(selectedRow.threshold_rate)
                : "",
            route_location: selectedRow.route_location ?? "",
            route_type: selectedRow.route_type,
            runs_s: selectedRow.runs_s,
            runs_u: selectedRow.runs_u,
            runs_m: selectedRow.runs_m,
            runs_t: selectedRow.runs_t,
            runs_w: selectedRow.runs_w,
            runs_h: selectedRow.runs_h,
            runs_f: selectedRow.runs_f,
            rotation_name: selectedRow.rotation_name ?? "",
            is_active: false,
          }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error ?? "Failed to deactivate route.");
        return;
      }

      await refreshAfterSave();
    } catch {
      setError("Failed to deactivate route.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="workspace-shell">

      <section className="value-strip">
        <div className="value-grid">
          <article className="value-card" style={{ gridColumn: "1 / -1" }}>
            <p className="value-card__eyebrow">Routes</p>
            <h2 className="value-card__title">Routes work surface</h2>
            <p className="value-card__body">
              Current active route baseline, built for quick review and direct
              operations management.
            </p>

            <div className="cta-row" style={{ marginTop: 14 }}>
              <Link className="button" href={`/company/${slug}`}>
                Back to company
              </Link>
              <Link className="button" href={`/company/${slug}/schedule`}>
                Schedule
              </Link>
              <Link className="button" href={`/company/${slug}/routes/history`}>
                History
              </Link>
              <button
                className="button button-primary"
                type="button"
                onClick={openCreate}
              >
                Add route
              </button>
            </div>
          </article>

          {error ? (
            <article className="value-card" style={{ gridColumn: "1 / -1" }}>
              <p style={{ color: "#c62828", margin: 0 }}>{error}</p>
            </article>
          ) : null}

          {addOpen ? (
            <RouteDraftEditor
              open={addOpen}
              mode="create"
              initialDraft={EMPTY_DRAFT}
              busy={busy}
              onClose={closeAddEditor}
              onSave={handleCreate}
            />
          ) : null}

          <article className="value-card" style={{ gridColumn: "1 / -1" }}>
            <p className="value-card__eyebrow">Filters</p>
            <h3 className="value-card__title">Current route posture</h3>

            <div
              className="routes-filter-controls"
              style={{
                marginTop: 16,
                display: "grid",
                gap: 12,
                gridTemplateColumns:
                  "minmax(220px, 1.2fr) repeat(3, minmax(150px, 0.55fr))",
              }}
            >
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search route, WA#, location, type"
                style={inputStyle}
              />

              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                style={inputStyle}
              >
                <option value="ALL">All types</option>
                <option value="CORE">Core</option>
                <option value="PEAK">Peak</option>
                <option value="OVERFLOW">Overflow</option>
              </select>

              <select
                value={rotationFilter}
                onChange={(e) => setRotationFilter(e.target.value)}
                style={inputStyle}
              >
                <option value="ALL">All rotations</option>
                <option value="__NONE__">No rotation</option>
                {rotationOptions.map((rotation) => (
                  <option key={rotation} value={rotation}>
                    {rotation}
                  </option>
                ))}
              </select>

              <label
                className="routes-filter-toggle"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  height: 40,
                  padding: "0 12px",
                  borderRadius: 10,
                  border: "1px solid #d6dfeb",
                  background: "#fff",
                }}
              >
                <input
                  type="checkbox"
                  checked={showThresholds}
                  onChange={(e) => setShowThresholds(e.target.checked)}
                />
                <span>Show thresholds</span>
              </label>
            </div>

            <div
              className="routes-family-table-wrap"
              style={{
                marginTop: 16,
                maxHeight: "68vh",
                overflow: "auto",
                border: "1px solid #e6edf5",
                borderRadius: 16,
                background: "#fff",
              }}
            >
              <table
                className="routes-family-table"
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  tableLayout: "fixed",
                }}
              >
                <colgroup>
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "6%" }} />
                  {showThresholds ? <col style={{ width: "5%" }} /> : null}
                  {showThresholds ? <col style={{ width: "6%" }} /> : null}
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "4.5%" }} />
                  <col style={{ width: "4.5%" }} />
                  <col style={{ width: "4.5%" }} />
                  <col style={{ width: "4.5%" }} />
                  <col style={{ width: "4.5%" }} />
                  <col style={{ width: "4.5%" }} />
                  <col style={{ width: "4.5%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "8%" }} />
                </colgroup>

                <thead>
                  <tr>
                    <th style={headerStyle}>Route</th>
                    <th style={headerStyle}>WA#</th>
                    {showThresholds ? (
                      <>
                        <th style={headerStyle}>Tshld</th>
                        <th style={headerStyle}>Tshld $</th>
                      </>
                    ) : null}
                    <th style={headerStyle}>Location</th>
                    <th style={headerStyleCompact}>S</th>
                    <th style={headerStyleCompact}>U</th>
                    <th style={headerStyleCompact}>M</th>
                    <th style={headerStyleCompact}>T</th>
                    <th style={headerStyleCompact}>W</th>
                    <th style={headerStyleCompact}>H</th>
                    <th style={headerStyleCompact}>F</th>
                    <th style={headerStyle}>Rotation</th>
                    <th style={headerStyle}>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {loading ? (
                    <tr>
                      <td
                        colSpan={showThresholds ? 14 : 12}
                        style={{ padding: 24, background: "#fff" }}
                      >
                        Loading routes...
                      </td>
                    </tr>
                  ) : filteredRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={showThresholds ? 14 : 12}
                        style={{ padding: 24, background: "#fff" }}
                      >
                        No routes match the current view.
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((row) => {
                      const isOpen = selectedRouteId === row.id;

                      return (
                        <FragmentRow
                          key={row.id}
                          isOpen={isOpen}
                          showThresholds={showThresholds}
                          row={row}
                          onEdit={() => openEdit(row.id)}
                          cellStyle={cellStyle}
                          compactCellStyle={compactCellStyle}
                          renderEditor={
                            isOpen && editorMode === "edit" ? (
                              <RouteDraftEditor
                                open={true}
                                mode="edit"
                                initialDraft={editorDraft}
                                busy={busy}
                                onClose={closeInlineEditor}
                                onSave={handleEdit}
                                onDeactivate={handleDeactivate}
                              />
                            ) : null
                          }
                        />
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div
              className="routes-table-footer-rail"
              style={{
                position: "sticky",
                bottom: 0,
                zIndex: 3,
                marginTop: 12,
                height: 20,
                border: "1px solid #d6dfeb",
                borderRadius: 14,
                background: "#fff",
              }}
            />
          </article>
        </div>
      </section>
    </main>
  );
}

function FragmentRow(props: {
  row: RouteGridRow;
  isOpen: boolean;
  showThresholds: boolean;
  onEdit: () => void;
  renderEditor: React.ReactNode;
  cellStyle: React.CSSProperties;
  compactCellStyle: React.CSSProperties;
}) {
  const { row, isOpen, showThresholds, onEdit, renderEditor, cellStyle, compactCellStyle } =
    props;

  return (
    <>
      <tr className="routes-family-table-row">
        <td style={cellStyle}>
          <div style={{ display: "grid", gap: 2 }}>
            <span>{row.route_name}</span>
            <span
              className="routes-table-secondary"
              style={{
                fontSize: 11,
                lineHeight: 1.2,
                color: "#7b879c",
                textTransform: "none",
              }}
            >
              {formatRouteType(row.route_type)}
            </span>
          </div>
        </td>
        <td style={cellStyle}>{row.current_wa_num ?? "—"}</td>
        {showThresholds ? (
          <>
            <td style={cellStyle}>{row.threshold_stops ?? "—"}</td>
            <td style={cellStyle}>
              {row.threshold_rate != null
                ? `$${Number(row.threshold_rate).toFixed(2)}`
                : "—"}
            </td>
          </>
        ) : null}
        <td style={cellStyle}>{row.route_location ?? "—"}</td>
        <td style={compactCellStyle}>{dayCell(row.runs_s)}</td>
        <td style={compactCellStyle}>{dayCell(row.runs_u)}</td>
        <td style={compactCellStyle}>{dayCell(row.runs_m)}</td>
        <td style={compactCellStyle}>{dayCell(row.runs_t)}</td>
        <td style={compactCellStyle}>{dayCell(row.runs_w)}</td>
        <td style={compactCellStyle}>{dayCell(row.runs_h)}</td>
        <td style={compactCellStyle}>{dayCell(row.runs_f)}</td>
        <td style={cellStyle}>
          {row.rotation_name ?? <span style={{ color: "#64748b" }}>—</span>}
        </td>
        <td style={cellStyle}>
          <button
            type="button"
            className="button"
            style={{ padding: "8px 12px", minWidth: 0 }}
            onClick={onEdit}
          >
            {isOpen ? "Close" : "Edit"}
          </button>
        </td>
      </tr>

      {isOpen ? (
        <tr className="route-history-row-editor">
          <td
            colSpan={showThresholds ? 14 : 12}
            style={{
              padding: 0,
              borderBottom: "1px solid #e6edf5",
              background: "#f8fafc",
            }}
          >
            <div
              className="route-history-row-editor__surface"
              style={{
                padding: 14,
                borderTop: "1px solid #e6edf5",
                background: "#f8fafc",
              }}
            >
              {renderEditor}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
