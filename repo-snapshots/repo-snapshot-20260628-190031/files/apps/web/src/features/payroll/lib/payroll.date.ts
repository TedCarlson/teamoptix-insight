export function iso(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return iso(date);
}

export function currentWeekEndFriday() {
  const today = new Date();
  const day = today.getUTCDay();
  const daysUntilFriday = (5 - day + 7) % 7;
  const friday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  friday.setUTCDate(friday.getUTCDate() + daysUntilFriday);
  return iso(friday);
}

export function defaultPayrollWeekEndFriday() {
  return addDays(currentWeekEndFriday(), -7);
}

export function weekDaysForEnd(weekEnd: string) {
  const start = addDays(weekEnd, -6);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

export function weekRangeLabel(weekEnd: string) {
  return `${addDays(weekEnd, -6)} → ${weekEnd}`;
}

export function dayLabel(value: string) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString([], {
    weekday: "short",
    month: "numeric",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function compactDayCode(value: string) {
  const weekday = new Date(`${value}T00:00:00Z`).toLocaleDateString([], {
    weekday: "short",
    timeZone: "UTC",
  });

  if (weekday === "Thu") return "H";
  if (weekday === "Sun") return "U";
  return weekday.slice(0, 1).toUpperCase();
}

export function workedDaysLabel(daysWorked: number, workedDays?: string[]) {
  const codes = (workedDays ?? []).map(compactDayCode).join("");
  return codes ? `${daysWorked} · ${codes}` : String(daysWorked);
}
