import { calendarDaysFromToday } from "./driverCalendar";


export type DriverTimeOffSelectionMode = "RANGE" | "SELECTED_ONLY";

function addIsoDays(isoDate: string, days: number) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function datesBetweenInclusive(startDate: string, endDate: string) {
  const dates: string[] = [];
  let current = startDate;

  while (current <= endDate) {
    dates.push(current);
    current = addIsoDays(current, 1);
  }

  return dates;
}

export function normalizeSelectedDates(selectedDates: string[]) {
  return Array.from(new Set(selectedDates)).sort();
}

export function rangeDatesForSelection(selectedDates: string[]) {
  const normalized = normalizeSelectedDates(selectedDates);
  if (normalized.length < 2) return normalized;

  return datesBetweenInclusive(normalized[0], normalized[normalized.length - 1]);
}

export function selectionHasRangeGap(selectedDates: string[]) {
  const normalized = normalizeSelectedDates(selectedDates);
  if (normalized.length < 2) return false;

  return rangeDatesForSelection(normalized).length !== normalized.length;
}

export function resolveTimeOffRequestedDates(
  selectedDates: string[],
  mode: DriverTimeOffSelectionMode
) {
  const normalized = normalizeSelectedDates(selectedDates);

  if (mode === "RANGE" && selectionHasRangeGap(normalized)) {
    return rangeDatesForSelection(normalized);
  }

  return normalized;
}

export type DriverTimeOffRequestEligibility = {
  canSubmit: boolean;
  reason: string | null;
};

export type DriverTimeOffBlackout = {
  blackout_date: string;
  message: string;
};

export const DRIVER_TIME_OFF_MIN_NOTICE_DAYS = 10;
export const DRIVER_TIME_OFF_MAX_SELECTED_DAYS = 15;

export function selectedDatesLabel(selectedDates: string[]) {
  const normalized = normalizeSelectedDates(selectedDates);

  if (normalized.length === 0) return "No days selected.";
  if (normalized.length === 1) return normalized[0];

  const rangeDates = rangeDatesForSelection(normalized);

  if (rangeDates.length !== normalized.length) {
    return `${normalized[0]} → ${normalized[normalized.length - 1]} · ${normalized.length} selected / ${rangeDates.length} in range`;
  }

  return `${normalized[0]} → ${normalized[normalized.length - 1]} · ${normalized.length} days`;
}

export function evaluateDriverTimeOffRequestEligibility(
  selectedDates: string[],
  blackouts: DriverTimeOffBlackout[] = []
): DriverTimeOffRequestEligibility {
  if (selectedDates.length === 0) {
    return {
      canSubmit: false,
      reason: "Select at least one day before submitting a request.",
    };
  }

  if (selectedDates.length > DRIVER_TIME_OFF_MAX_SELECTED_DAYS) {
    return {
      canSubmit: false,
      reason:
        "Requests longer than 15 days should be discussed directly with leadership.",
    };
  }

  const blackoutByDate = new Map(
    blackouts.map((blackout) => [blackout.blackout_date, blackout])
  );
  const blockedDate = selectedDates.find((isoDate) => blackoutByDate.has(isoDate));

  if (blockedDate) {
    const guidance = blackoutByDate.get(blockedDate)?.message;
    return {
      canSubmit: false,
      reason: `${blockedDate} is a blackout date. ${
        guidance ||
        "If you have a persistent need for time off, please contact your leadership team directly."
      }`,
    };
  }

  const hasNearTermDate = selectedDates.some(
    (isoDate) => calendarDaysFromToday(isoDate) < DRIVER_TIME_OFF_MIN_NOTICE_DAYS
  );

  if (hasNearTermDate) {
    return {
      canSubmit: false,
      reason:
        "Time off requests require at least 10 days notice. Please speak directly with leadership for near-term schedule changes.",
    };
  }

  return {
    canSubmit: true,
    reason: null,
  };
}
