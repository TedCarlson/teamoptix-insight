"use client";

import { useCallback, useEffect, useState } from "react";

type TimekeepingOversightMode = "off" | "signal_only" | "driver_correction" | "blocking";

type OperationsConfigResponse = {
  config?: {
    timekeeping_oversight_mode?: TimekeepingOversightMode | string | null;
  } | null;
  error?: string;
};

type CompanyTimekeepingOversightConfigProps = {
  slug: string;
  canEdit: boolean;
};

const modeCopy: Record<TimekeepingOversightMode, { label: string; description: string }> = {
  off: {
    label: "Off",
    description:
      "Driver discrepancies are not surfaced. Payroll can rely on generated DSW evidence while the company onboards.",
  },
  signal_only: {
    label: "Signal only",
    description:
      "Insight can collect discrepancy signals for admins without interrupting driver clock actions.",
  },
  driver_correction: {
    label: "Driver correction",
    description:
      "Drivers see correction cards for supported timekeeping discrepancies and can heal their own records.",
  },
  blocking: {
    label: "Blocking",
    description:
      "Drivers must resolve prior discrepancies before new clock actions are allowed. Use after correction flows are proven.",
  },
};

function cleanMode(value: unknown): TimekeepingOversightMode {
  return value === "signal_only" || value === "driver_correction" || value === "blocking"
    ? value
    : "off";
}

export default function CompanyTimekeepingOversightConfig({
  slug,
  canEdit,
}: CompanyTimekeepingOversightConfigProps) {
  const [mode, setMode] = useState<TimekeepingOversightMode>("off");
  const [draftMode, setDraftMode] = useState<TimekeepingOversightMode>("off");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadConfig = useCallback(async () => {
    if (!slug) return;

    try {
      setLoading(true);
      setError(null);

      const res = await fetch(`/api/company/${slug}/config/operations`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as OperationsConfigResponse;

      if (!res.ok) {
        setError(data.error ?? "Failed to load timekeeping config.");
        return;
      }

      const nextMode = cleanMode(data.config?.timekeeping_oversight_mode);
      setMode(nextMode);
      setDraftMode(nextMode);
    } catch {
      setError("Failed to load timekeeping config.");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  async function saveMode() {
    if (!slug || saving || !canEdit) return;

    try {
      setSaving(true);
      setError(null);
      setMessage(null);

      const res = await fetch(`/api/company/${slug}/config/operations`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timekeeping_oversight_mode: draftMode }),
      });
      const data = (await res.json().catch(() => ({}))) as OperationsConfigResponse;

      if (!res.ok) {
        setError(data.error ?? "Failed to save timekeeping config.");
        return;
      }

      const nextMode = cleanMode(data.config?.timekeeping_oversight_mode);
      setMode(nextMode);
      setDraftMode(nextMode);
      setMessage("Timekeeping oversight updated.");
    } catch {
      setError("Failed to save timekeeping config.");
    } finally {
      setSaving(false);
    }
  }

  const selectedCopy = modeCopy[draftMode];

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <p className="app-card__body" style={{ margin: 0 }}>
        Control whether Insight only generates payroll evidence from operations data or starts
        surfacing driver timekeeping discrepancies for self-correction.
      </p>

      <div style={{ display: "grid", gap: 8 }}>
        <label className="context-stat__label" htmlFor="timekeeping-oversight-mode">
          Oversight mode
        </label>
        <select
          id="timekeeping-oversight-mode"
          className="workspace-select"
          value={draftMode}
          disabled={!canEdit || loading || saving}
          onChange={(event) => setDraftMode(cleanMode(event.target.value))}
        >
          {(Object.keys(modeCopy) as TimekeepingOversightMode[]).map((item) => (
            <option key={item} value={item}>
              {modeCopy[item].label}
            </option>
          ))}
        </select>
      </div>

      <div className="context-stat" style={{ padding: "10px 12px" }}>
        <span className="context-stat__label">Selected behavior</span>
        <strong>{selectedCopy.label}</strong>
        <span style={{ display: "block", marginTop: 4, color: "#64748b", fontSize: 13 }}>
          {selectedCopy.description}
        </span>
      </div>

      {error ? <p style={{ color: "#c62828", margin: 0 }}>{error}</p> : null}
      {message ? <p style={{ color: "#0f9f6e", margin: 0 }}>{message}</p> : null}

      <div className="cta-row" style={{ marginTop: 0 }}>
        <button
          type="button"
          className="button button-primary"
          disabled={!canEdit || loading || saving || draftMode === mode}
          onClick={() => void saveMode()}
        >
          {saving ? "Saving..." : "Save timekeeping oversight"}
        </button>
      </div>
    </div>
  );
}
