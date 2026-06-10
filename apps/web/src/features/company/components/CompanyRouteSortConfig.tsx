"use client";

import { useEffect, useState } from "react";

type RouteSortKey = "route_name" | "current_wa_num";

type OperationsConfig = {
  route_sort_key: RouteSortKey;
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
    setConfig({ route_sort_key: routeSortKey });

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
      });
      setMessage("Route order saved.");
    } catch {
      setError("Failed to save route order.");
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

      {message ? <p style={{ color: "#0f9f6e", margin: 0 }}>{message}</p> : null}
      {error ? <p style={{ color: "#c62828", margin: 0 }}>{error}</p> : null}
    </section>
  );
}
