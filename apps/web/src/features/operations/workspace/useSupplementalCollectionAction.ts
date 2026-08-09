"use client";

import { useEffect, useMemo, useState } from "react";
import { resolveOperatingDateDecision } from "./operationsOperatingCalendar";

type OperatingCalendarSummary = {
  assignment_id: string;
  start_time: string | null;
  end_time: string | null;
  cadence_minutes: number | null;
  operating_weekdays: number[];
  operating_date_overrides: Record<string, "OPERATING" | "CLOSED">;
};

export type SupplementalCollectionAction = {
  label: string;
  saving: boolean;
  error: string | null;
  onAction: () => Promise<void>;
};

export function useSupplementalCollectionAction(params: {
  slug: string;
  serviceDate: string;
  enabled: boolean;
}) {
  const { slug, serviceDate, enabled } = params;
  const [calendar, setCalendar] = useState<OperatingCalendarSummary | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !slug || !serviceDate) return;

    let active = true;
    setError(null);

    void fetch(
      `/api/company/${slug}/operations/collection-calendar?date=${serviceDate}`,
      { credentials: "include", cache: "no-store" }
    )
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            typeof data?.error === "string"
              ? data.error
              : "Failed to load the operating calendar."
          );
        }
        if (!active) return;
        setCalendar(
          data?.operating_calendar
            ? (data.operating_calendar as OperatingCalendarSummary)
            : null
        );
        setCanManage(data?.can_manage === true);
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setCalendar(null);
        setCanManage(false);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load the operating calendar."
        );
      });

    return () => {
      active = false;
    };
  }, [enabled, serviceDate, slug]);

  const decision = useMemo(
    () =>
      resolveOperatingDateDecision({
        operationalDate: serviceDate,
        dayOfWeek: new Date(`${serviceDate}T00:00:00Z`).getUTCDay(),
        operatingWeekdays: calendar?.operating_weekdays,
        operatingDateOverrides: calendar?.operating_date_overrides,
      }),
    [calendar, serviceDate]
  );

  async function updateOverride() {
    if (!calendar || saving) return;

    const overrideMode =
      decision.override === "OPERATING" ? "INHERIT" : "OPERATING";

    try {
      setSaving(true);
      setError(null);
      const response = await fetch(
        `/api/company/${slug}/operations/collection-calendar`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            operational_date: serviceDate,
            override_mode: overrideMode,
          }),
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : "Failed to update today’s collection calendar."
        );
      }

      setCalendar((current) => {
        if (!current) return current;
        const overrides = { ...current.operating_date_overrides };
        if (overrideMode === "INHERIT") {
          delete overrides[serviceDate];
        } else {
          overrides[serviceDate] = "OPERATING";
        }
        return { ...current, operating_date_overrides: overrides };
      });
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Failed to update today’s collection calendar."
      );
    } finally {
      setSaving(false);
    }
  }

  const action: SupplementalCollectionAction | undefined =
    canManage &&
    calendar &&
    (!decision.operates || decision.override === "OPERATING")
      ? {
          label:
            decision.override === "OPERATING"
              ? "Use normal calendar"
              : "Collect today",
          saving,
          error,
          onAction: updateOverride,
        }
      : undefined;

  return { action, decision, error };
}
