"use client";

import ComplianceDocumentSignal from "@/features/compliance/components/ComplianceDocumentSignal";
import { useEffect, useState } from "react";

type ChecklistItem = {
  item_type_id: string;
  item_key: string;
  label: string;
  description: string | null;
  is_required: boolean;
  sort_order: number;
  is_complete: boolean;
  completed_at: string | null;
  note: string | null;
};

type Progress = {
  required_total: number;
  required_complete: number;
  percent: number;
};

type Props = {
  slug: string;
  rosterId: string;
  onChanged?: () => void | Promise<void>;
};

export default function CandidateChecklistPanel({ slug, rosterId, onChanged }: Props) {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [progress, setProgress] = useState<Progress>({
    required_total: 0,
    required_complete: 0,
    percent: 0,
  });
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadChecklist() {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch(
        `/api/company/${slug}/hiring/candidates/${rosterId}/checklist`,
        { credentials: "include" }
      );

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error ?? "Failed to load checklist.");
        setItems([]);
        return;
      }

      setItems((data?.checklist ?? []) as ChecklistItem[]);
      setProgress(
        data?.progress ?? {
          required_total: 0,
          required_complete: 0,
          percent: 0,
        }
      );
    } catch {
      setError("Checklist request failed.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(
          `/api/company/${slug}/hiring/candidates/${rosterId}/checklist`,
          { credentials: "include" }
        );

        const data = await res.json();

        if (!active) return;

        if (!res.ok) {
          setError(data?.error ?? "Failed to load checklist.");
          setItems([]);
          return;
        }

        setItems((data?.checklist ?? []) as ChecklistItem[]);
        setProgress(
          data?.progress ?? {
            required_total: 0,
            required_complete: 0,
            percent: 0,
          }
        );
      } catch {
        if (!active) return;
        setError("Checklist request failed.");
        setItems([]);
      } finally {
        if (active) setLoading(false);
      }
    }

    if (slug && rosterId) void load();

    return () => {
      active = false;
    };
  }, [slug, rosterId]);

  async function toggleItem(item: ChecklistItem) {
    setBusyKey(item.item_key);
    setError(null);

    try {
      const res = await fetch(
        `/api/company/${slug}/hiring/candidates/${rosterId}/checklist`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            item_key: item.item_key,
            is_complete: !item.is_complete,
          }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error ?? "Failed to update checklist.");
        return;
      }

      await loadChecklist();
      await onChanged?.();
    } catch {
      setError("Checklist update failed.");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <article className="value-card" style={{ gridColumn: "1 / span 2" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "flex-start",
        }}
      >
        <div>
          <p className="value-card__eyebrow">Onboarding</p>
          <h3 className="value-card__title">Readiness checklist</h3>
          <p className="value-card__body" style={{ marginTop: 8 }}>
            Required progress: {progress.required_complete}/{progress.required_total} ·{" "}
            {progress.percent}%
          </p>
        </div>

        <strong style={{ fontSize: 22 }}>{progress.percent}%</strong>
      </div>

      {error ? (
        <p style={{ color: "#c62828", marginTop: 12 }}>{error}</p>
      ) : null}

      {loading ? (
        <div style={{ paddingTop: 16 }}>Loading checklist...</div>
      ) : items.length === 0 ? (
        <div style={{ paddingTop: 16 }}>No checklist items configured.</div>
      ) : (
        <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
          {items.map((item) => (
            <label
              key={item.item_key}
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr auto",
                gap: 10,
                alignItems: "start",
                padding: "10px 0",
                borderBottom: "1px solid #e6edf5",
              }}
            >
              <input
                type="checkbox"
                checked={item.is_complete}
                disabled={busyKey === item.item_key}
                onChange={() => toggleItem(item)}
              />

              <span style={{ display: "grid", gap: 5 }}>
                <ComplianceDocumentSignal
                  iconKey={item.item_key}
                  label={item.label}
                  ready={item.is_complete}
                  compact
                />

                {item.description ? (
                  <span
                    className="value-card__body"
                    style={{ display: "block", marginTop: 2 }}
                  >
                    {item.description}
                  </span>
                ) : null}
              </span>

              <span className="hero-stat__label">
                {item.is_required ? "Required" : "Optional"}
              </span>
            </label>
          ))}
        </div>
      )}
    </article>
  );
}
