"use client";

import ComplianceDocumentSignal from "@/features/compliance/components/ComplianceDocumentSignal";
import type { CandidateWorkflowGroup } from "@/features/hiring/lib/candidateChecklistWorkflow";
import { useEffect, useState } from "react";
import styles from "./candidate-checklist.module.css";

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
  is_blocked: boolean;
  blocked_reason: string | null;
  group?: CandidateWorkflowGroup;
};

export type CandidateChecklistProgress = {
  required_total: number;
  required_complete: number;
  percent: number;
};

type Props = {
  slug: string;
  rosterId: string;
  onChanged?: () => void | Promise<void>;
  onProgressChange?: (progress: CandidateChecklistProgress) => void;
  embedded?: boolean;
};

const EMPTY_PROGRESS: CandidateChecklistProgress = {
  required_total: 0,
  required_complete: 0,
  percent: 0,
};

export default function CandidateChecklistPanel({
  slug,
  rosterId,
  onChanged,
  onProgressChange,
  embedded = false,
}: Props) {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [progress, setProgress] = useState<CandidateChecklistProgress>(EMPTY_PROGRESS);
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
      const nextProgress = (data?.progress ?? EMPTY_PROGRESS) as CandidateChecklistProgress;
      setProgress(nextProgress);
      onProgressChange?.(nextProgress);
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
        const nextProgress = (data?.progress ?? EMPTY_PROGRESS) as CandidateChecklistProgress;
        setProgress(nextProgress);
        onProgressChange?.(nextProgress);
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
  }, [slug, rosterId, onProgressChange]);

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

  const numberedItems = items.map((item, index) => ({ item, stepNumber: index + 1 }));
  const groupOrder = Array.from(
    new Set(numberedItems.map(({ item }) => item.group ?? "Readiness"))
  ) as CandidateWorkflowGroup[];
  const groupedItems = groupOrder.map((group) => ({
    group,
    items: numberedItems.filter(({ item }) => (item.group ?? "Readiness") === group),
  })).filter(({ items: groupItems }) => groupItems.length > 0);

  return (
    <article
      className={`${embedded ? "" : "value-card"} ${styles.panel}`.trim()}
      style={embedded ? { minWidth: 0 } : { gridColumn: "1 / span 2" }}
    >
      <div className={styles.header}>
        <p className={styles.progressCopy}>
          Required progress: <strong>{progress.required_complete}/{progress.required_total}</strong>
          {" · "}{progress.percent}%
        </p>
        <div className={styles.progressTrack} aria-hidden="true">
          <span className={styles.progressFill} style={{ width: `${progress.percent}%` }} />
        </div>
      </div>

      {error ? (
        <p className={`${styles.message} ${styles.error}`}>{error}</p>
      ) : null}

      {loading ? (
        <div className={styles.message}>Loading checklist...</div>
      ) : items.length === 0 ? (
        <div className={styles.message}>No checklist items configured.</div>
      ) : (
        <div className={styles.groups}>
          {groupedItems.map(({ group, items: groupItems }) => (
            <section className={styles.group} key={group} aria-labelledby={`${rosterId}-${group}`}>
              <h4 className={styles.groupLabel} id={`${rosterId}-${group}`}>{group}</h4>
              <div className={styles.steps}>
                {groupItems.map(({ item, stepNumber }) => {
                  const disabled = busyKey === item.item_key || item.is_blocked;
                  const detail = item.is_blocked && item.blocked_reason
                    ? `Waiting · ${item.blocked_reason}`
                    : item.description;

                  return (
                    <div
                      key={item.item_key}
                      className={`${styles.step} ${item.is_complete ? styles.complete : ""} ${item.is_blocked ? styles.blocked : ""}`.trim()}
                    >
                      <button
                        type="button"
                        className={styles.stepControl}
                        disabled={disabled}
                        onClick={() => toggleItem(item)}
                        role="checkbox"
                        aria-checked={item.is_complete}
                        aria-label={`${item.is_complete ? "Reopen" : "Complete"} step ${stepNumber}: ${item.label}`}
                        aria-describedby={detail ? `${item.item_key}-detail` : undefined}
                      >
                        {stepNumber}
                      </button>

                      <div className={styles.stepBody}>
                        <ComplianceDocumentSignal
                          iconKey={item.item_key}
                          label={item.label}
                          ready={item.is_complete}
                          compact
                        />
                        {detail ? (
                          <span
                            id={`${item.item_key}-detail`}
                            className={`${styles.description} ${item.is_blocked ? styles.waiting : ""}`.trim()}
                            title={detail}
                          >
                            {detail}
                          </span>
                        ) : null}
                      </div>

                      <span className={styles.requirement}>
                        {item.is_required ? "Required" : "Optional"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </article>
  );
}
