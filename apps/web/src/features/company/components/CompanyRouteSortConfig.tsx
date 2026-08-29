"use client";

import { useEffect, useState } from "react";

type RouteSortKey = "route_name" | "current_wa_num";

type OperationsConfig = {
  route_sort_key: RouteSortKey;
  driver_full_time_day_threshold: number;
};

const inputStyle: React.CSSProperties = {
  minHeight: 42,
  padding: "0 12px",
  borderRadius: 12,
  border: "1px solid #d6dfeb",
  background: "#fff",
};

export default function CompanyRouteSortConfig(props: {
  slug: string;
  canEdit: boolean;
}) {
  const { slug, canEdit } = props;

  const [config, setConfig] = useState<OperationsConfig>({
    route_sort_key: "route_name",
    driver_full_time_day_threshold: 5,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadConfig() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/company/${slug}/config/operations`, {
          credentials: "include",
          cache: "no-store",
        });

        const data = await res.json();

        if (!active) return;

        if (!res.ok) {
          setError(data?.error ?? "Failed to load route order.");
          return;
        }

        setConfig({
          route_sort_key:
            data?.config?.route_sort_key === "current_wa_num"
              ? "current_wa_num"
              : "route_name",
          driver_full_time_day_threshold:
            Number(data?.config?.driver_full_time_day_threshold) || 5,
        });
      } catch {
        if (active) setError("Failed to load route order.");
      } finally {
        if (active) setLoading(false);
      }
    }

    if (slug) void loadConfig();

    return () => {
      active = false;
    };
  }, [slug]);

  async function saveConfig(routeSortKey: RouteSortKey) {
    setSaving(true);
    setMessage(null);
    setError(null);
    setConfig((current) => ({ ...current, route_sort_key: routeSortKey }));

    try {
      const res = await fetch(`/api/company/${slug}/config/operations`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          route_sort_key: routeSortKey,
          route_sort_direction: "asc",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error ?? "Failed to save route order.");
        return;
      }

      setConfig({
        route_sort_key:
          data?.config?.route_sort_key === "current_wa_num"
            ? "current_wa_num"
            : "route_name",
        driver_full_time_day_threshold:
          Number(data?.config?.driver_full_time_day_threshold) ||
          config.driver_full_time_day_threshold,
      });
      setMessage("Route order saved.");
    } catch {
      setError("Failed to save route order.");
    } finally {
      setSaving(false);
    }
  }

  async function saveDriverThreshold(threshold: number) {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/company/${slug}/config/operations`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ driver_full_time_day_threshold: threshold }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Failed to save driver utilization threshold.");
        return;
      }
      setConfig((current) => ({
        ...current,
        driver_full_time_day_threshold:
          Number(data?.config?.driver_full_time_day_threshold) || threshold,
      }));
      setMessage("Driver utilization threshold saved.");
    } catch {
      setError("Failed to save driver utilization threshold.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      style={{
        display: "grid",
        gap: 10,
        padding: 12,
        border: "1px solid #e6edf5",
        borderRadius: 16,
        background: "#fbfdff",
      }}
    >
      <div>
        <p className="value-card__eyebrow">Route order</p>
        <h4 style={{ margin: "4px 0 0", fontSize: 15 }}>
          Default operations route order
        </h4>
        <p className="app-card__body" style={{ marginTop: 4 }}>
          Choose how this company prefers routes displayed across Dispatch, Routes, and Schedule.
        </p>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          className="button"
          disabled={!canEdit || loading || saving}
          onClick={() => saveConfig("route_name")}
          style={
            config.route_sort_key === "route_name"
              ? {
                  borderColor: "#2563eb",
                  background: "#eff6ff",
                  color: "#1d4ed8",
                  fontWeight: 900,
                  boxShadow: "0 10px 22px rgba(37,99,235,.14)",
                }
              : undefined
          }
        >
          Route name order
        </button>

        <button
          type="button"
          className="button"
          disabled={!canEdit || loading || saving}
          onClick={() => saveConfig("current_wa_num")}
          style={
            config.route_sort_key === "current_wa_num"
              ? {
                  borderColor: "#2563eb",
                  background: "#eff6ff",
                  color: "#1d4ed8",
                  fontWeight: 900,
                  boxShadow: "0 10px 22px rgba(37,99,235,.14)",
                }
              : undefined
          }
        >
          Work area order
        </button>
      </div>

      <div style={inputStyle}>
        <p className="app-card__body" style={{ margin: "10px 0 0" }}>
          Current:{" "}
          <strong>
            {config.route_sort_key === "current_wa_num"
              ? "Work area number"
              : "Route name"}
          </strong>
        </p>
      </div>

      <div style={{ borderTop: "1px solid #e6edf5", paddingTop: 12 }}>
        <p className="value-card__eyebrow">Driver utilization</p>
        <h4 style={{ margin: "4px 0 0", fontSize: 15 }}>
          Full-time baseline threshold
        </h4>
        <p className="app-card__body" style={{ marginTop: 4 }}>
          A Driver or AVP Driver at or above this many baseline days is derived as full-time. Lower scheduled utilization is derived as part-time.
        </p>
        <label style={{ display: "grid", gap: 6, maxWidth: 260, marginTop: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: "#475569" }}>
            Baseline days per week
          </span>
          <select
            disabled={!canEdit || loading || saving}
            value={config.driver_full_time_day_threshold}
            onChange={(event) => void saveDriverThreshold(Number(event.target.value))}
            style={inputStyle}
          >
            {Array.from({ length: 7 }, (_, index) => index + 1).map((days) => (
              <option key={days} value={days}>{days} day{days === 1 ? "" : "s"}</option>
            ))}
          </select>
        </label>
      </div>

      {message ? <p style={{ color: "#0f9f6e", margin: 0 }}>{message}</p> : null}
      {error ? <p style={{ color: "#c62828", margin: 0 }}>{error}</p> : null}
    </section>
  );
}
