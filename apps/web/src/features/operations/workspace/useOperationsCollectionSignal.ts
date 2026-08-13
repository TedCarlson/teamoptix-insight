"use client";

import { useCallback, useEffect, useState } from "react";
import {
  deriveOperationsCollectionSignal,
  type OperationsCollectionRequestSignalRow,
  type OperationsCollectionSignal,
  type OperationsRunnerSignalSchedule,
  type OperationsSignalCalendar,
} from "./operationsCollectionSignal";

type StatusPayload = {
  operational_date?: string | null;
  latest_ingestion_success_at?: string | null;
  rows?: OperationsCollectionRequestSignalRow[];
  runner_schedule?: OperationsRunnerSignalSchedule | null;
  operating_calendar?: OperationsSignalCalendar | null;
};

export function useOperationsCollectionSignal(slug: string) {
  const [signal, setSignal] = useState<OperationsCollectionSignal | null>(null);

  const refresh = useCallback(async () => {
    if (!slug) return;
    try {
      const response = await fetch(
        `/api/company/${slug}/collection-requests?mode=status&limit=10`,
        { credentials: "include", cache: "no-store" }
      );
      const payload = (await response.json()) as StatusPayload & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Collection status unavailable.");

      setSignal(
        deriveOperationsCollectionSignal({
          now: new Date(),
          operationalDate: payload.operational_date,
          latestIngestionSuccessAt:
            payload.latest_ingestion_success_at ?? null,
          requests: Array.isArray(payload.rows) ? payload.rows : [],
          runnerSchedule: payload.runner_schedule ?? null,
          operatingCalendar: payload.operating_calendar ?? null,
        })
      );
    } catch {
      // Preserve the last authoritative signal during a transient refresh
      // failure instead of replacing it with page-local data.
    }
  }, [slug]);

  useEffect(() => {
    void refresh();
    const timerId = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(timerId);
  }, [refresh]);

  return { signal, refresh };
}
