import { calendarDaysFromToday } from "./driverCalendar";

export type DriverTimeOffRequestEligibility = {
  canSubmit: boolean;
  reason: string | null;
};

export const DRIVER_TIME_OFF_MIN_NOTICE_DAYS = 10;
export const DRIVER_TIME_OFF_MAX_SELECTED_DAYS = 15;

export function selectedDatesLabel(selectedDates: string[]) {
  if (selectedDates.length === 0) return "No days selected.";
  if (selectedDates.length === 1) return selectedDates[0];

  return `${selectedDates[0]} → ${selectedDates[selectedDates.length - 1]} · ${selectedDates.length} days`;
}

export function evaluateDriverTimeOffRequestEligibility(
  selectedDates: string[]
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
