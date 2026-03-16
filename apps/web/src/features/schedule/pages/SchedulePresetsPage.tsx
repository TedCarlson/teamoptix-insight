"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import SiteHeader from "@/features/landing/components/SiteHeader";
import SchedulePresetEditor, {
  type SchedulePresetDraft,
} from "@/features/schedule/components/SchedulePresetEditor";

type SchedulePresetRow = {
  id: string;
  preset_code: string;
  works_s: boolean;
  works_u: boolean;
  works_m: boolean;
  works_t: boolean;
  works_w: boolean;
  works_h: boolean;
  works_f: boolean;
  uses_rotation: boolean;
};

const EMPTY_PRESET_DRAFT: SchedulePresetDraft = {
  preset_code: "",
  works_s: false,
  works_u: false,
  works_m: false,
  works_t: false,
  works_w: false,
  works_h: false,
  works_f: false,
  uses_rotation: false,
};

function dayPresetCell(active: boolean) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 28,
        height: 22,
        padding: "0 6px",
        borderRadius: 999,
        border: `1px solid ${active ? "#7bc48a" : "#d6dfeb"}`,
        background: active ? "#e8f6eb" : "#f8fafc",
        color: active ? "#2f8f46" : "#64748b",
        fontSize: 10,
        fontWeight: 700,
        lineHeight: 1,
      }}
    >
      {active ? "ON" : "—"}
    </span>
  );
}

const cellStyle: React.CSSProperties = {
  padding: "10px 10px",
  borderBottom: "1px solid #e6edf5",
  verticalAlign: "middle",
};

const compactCellStyle: React.CSSProperties = {
  padding: "8px 2px",
  borderBottom: "1px solid #e6edf5",
  verticalAlign: "middle",
  textAlign: "center",
};

const headerBaseStyle: React.CSSProperties = {
  borderBottom: "1px solid #d6dfeb",
  fontSize: 12,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "#5c6b84",
  verticalAlign: "middle",
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

export default function SchedulePresetsPage() {
  const params = useParams();
  const slug = String(params?.slug ?? "");

  const [presets, setPresets] = useState<SchedulePresetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorBusy, setEditorBusy] = useState(false);

  async function loadPresets() {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch(`/api/company/${slug}/schedule/presets`, {
        credentials: "include",
        cache: "no-store",
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error ?? "Failed to load presets.");
        setPresets([]);
        return;
      }

      setPresets((data?.presets ?? []) as SchedulePresetRow[]);
    } catch {
      setError("Failed to load presets.");
      setPresets([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!slug) return;
    loadPresets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  async function handleCreatePreset(draft: SchedulePresetDraft) {
    try {
      setEditorBusy(true);
      setError(null);

      const res = await fetch(`/api/company/${slug}/schedule/presets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(draft),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error ?? "Failed to create preset.");
        return;
      }

      setEditorOpen(false);
      await loadPresets();
    } catch {
      setError("Failed to create preset.");
    } finally {
      setEditorBusy(false);
    }
  }

  return (
    <main className="landing-page">
      <SiteHeader />

      <section className="value-strip">
        <div className="value-grid">
          <article className="value-card" style={{ gridColumn: "1 / -1" }}>
            <p className="value-card__eyebrow">Schedule</p>
            <h2 className="value-card__title">Preset management</h2>
            <p className="value-card__body">
              Maintain recurring production-week preset patterns here. Schedule
              setup surfaces consume this library.
            </p>

            <div className="cta-row" style={{ marginTop: 14 }}>
              <Link className="button" href={`/company/${slug}/schedule`}>
                Back to schedule
              </Link>
              <Link className="button" href={`/company/${slug}/routes`}>
                Routes
              </Link>
              <button
                className="button button-primary"
                type="button"
                onClick={() => setEditorOpen(true)}
              >
                Add preset
              </button>
            </div>
          </article>

          {error ? (
            <article className="value-card" style={{ gridColumn: "1 / -1" }}>
              <p style={{ color: "#c62828", margin: 0 }}>{error}</p>
            </article>
          ) : null}

          <SchedulePresetEditor
            open={editorOpen}
            busy={editorBusy}
            initialDraft={EMPTY_PRESET_DRAFT}
            onClose={() => {
              if (!editorBusy) setEditorOpen(false);
            }}
            onSave={handleCreatePreset}
          />

          <article className="value-card" style={{ gridColumn: "1 / -1" }}>
            <p className="value-card__eyebrow">Preset library</p>
            <h3 className="value-card__title">Current presets</h3>

            <div style={{ marginTop: 16, overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  tableLayout: "fixed",
                }}
              >
                <colgroup>
                  <col style={{ width: "18%" }} />
                  <col style={{ width: "9%" }} />
                  <col style={{ width: "9%" }} />
                  <col style={{ width: "9%" }} />
                  <col style={{ width: "9%" }} />
                  <col style={{ width: "9%" }} />
                  <col style={{ width: "9%" }} />
                  <col style={{ width: "9%" }} />
                  <col style={{ width: "12%" }} />
                </colgroup>

                <thead>
                  <tr>
                    <th style={headerStyle}>Preset</th>
                    <th style={headerStyleCompact}>S</th>
                    <th style={headerStyleCompact}>U</th>
                    <th style={headerStyleCompact}>M</th>
                    <th style={headerStyleCompact}>T</th>
                    <th style={headerStyleCompact}>W</th>
                    <th style={headerStyleCompact}>H</th>
                    <th style={headerStyleCompact}>F</th>
                    <th style={headerStyle}>Rotation</th>
                  </tr>
                </thead>

                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={9} style={{ padding: 24 }}>
                        Loading presets...
                      </td>
                    </tr>
                  ) : presets.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ padding: 24 }}>
                        No presets yet.
                      </td>
                    </tr>
                  ) : (
                    presets.map((preset) => (
                      <tr key={preset.id}>
                        <td style={cellStyle}>{preset.preset_code}</td>
                        <td style={compactCellStyle}>
                          {dayPresetCell(preset.works_s)}
                        </td>
                        <td style={compactCellStyle}>
                          {dayPresetCell(preset.works_u)}
                        </td>
                        <td style={compactCellStyle}>
                          {dayPresetCell(preset.works_m)}
                        </td>
                        <td style={compactCellStyle}>
                          {dayPresetCell(preset.works_t)}
                        </td>
                        <td style={compactCellStyle}>
                          {dayPresetCell(preset.works_w)}
                        </td>
                        <td style={compactCellStyle}>
                          {dayPresetCell(preset.works_h)}
                        </td>
                        <td style={compactCellStyle}>
                          {dayPresetCell(preset.works_f)}
                        </td>
                        <td style={cellStyle}>
                          {preset.uses_rotation ? "Uses rotation" : "None"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}