"use client";

import { useEffect, useMemo, useState } from "react";

type IntelligenceEntry = {
  id: string;
  timestamp: string | null;
  label: string;
  service_date?: string | null;
  status?: string | null;
};

type IntelligenceSource = {
  source: string;
  entries: IntelligenceEntry[];
};

type Props = {
  slug: string;
  serviceDate: string;
  surface: "dispatch" | "delivery-window";
  frozen?: boolean;
  title?: string;
};

function formatTime(value: string | null) {
  if (!value) return "—";

  const normalized = value.includes("UTC") ? value.replace(" UTC", "Z") : value;
  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export default function OperationsIntelligenceFeed(props: Props) {
  const { slug, serviceDate, surface, frozen = false, title = "Intelligence Feed" } = props;
  const [sources, setSources] = useState<IntelligenceSource[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (frozen) return;

    let active = true;

    async function loadFeed() {
      try {
        setError(null);

        const res = await fetch(
          `/api/company/${slug}/operations/reports/intelligence-feed?date=${serviceDate}&surface=${surface}`,
          { credentials: "include", cache: "no-store" }
        );

        const data = await res.json();

        if (!active) return;

        if (!res.ok) {
          setSources([]);
          setError(data?.error ?? "Failed to load intelligence feed.");
          return;
        }

        setSources(data?.sources ?? []);
      } catch (err) {
        if (!active) return;
        setSources([]);
        setError(err instanceof Error ? err.message : "Failed to load intelligence feed.");
      }
    }

    if (slug && serviceDate) void loadFeed();

    return () => {
      active = false;
    };
  }, [frozen, serviceDate, slug, surface]);

  const hasEntries = useMemo(
    () => sources.some((source) => source.entries.length > 0),
    [sources]
  );

  return (
    <section
      style={{
        border: "1px solid #e6edf5",
        borderRadius: 14,
        background: "#fff",
        padding: 12,
        display: "grid",
        gap: 10,
      }}
    >
      <div>
        <p className="eyebrow" style={{ margin: 0 }}>
          {title}
        </p>
        {frozen ? (
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 12, fontWeight: 800 }}>
            Dispatch locked. Intelligence frozen.
          </p>
        ) : null}
      </div>

      {error ? (
        <p style={{ margin: 0, color: "#991b1b", fontSize: 12, fontWeight: 800 }}>
          {error}
        </p>
      ) : null}

      {!frozen && !hasEntries && !error ? (
        <p style={{ margin: 0, color: "#94a3b8", fontSize: 12, fontWeight: 800 }}>
          No source updates yet.
        </p>
      ) : null}

      {!frozen
        ? sources.map((source) => (
            <div key={source.source} style={{ display: "grid", gap: 5 }}>
              <strong
                style={{
                  color: "#334155",
                  fontSize: 12,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                {source.source}
              </strong>

              {source.entries.map((entry) => (
                <div
                  key={entry.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    color: "#64748b",
                    fontSize: 12,
                    fontWeight: 850,
                  }}
                >
                  <span style={{ color: "#0f172a" }}>{formatTime(entry.timestamp)}</span>
                  <span style={{ textAlign: "right" }}>{entry.label}</span>
                </div>
              ))}
            </div>
          ))
        : null}
    </section>
  );
}
