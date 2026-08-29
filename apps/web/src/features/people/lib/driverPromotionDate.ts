function easternDateParts(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const value = (type: "year" | "month" | "day") =>
    Number(parts.find((part) => part.type === type)?.value);

  return { year: value("year"), month: value("month"), day: value("day") };
}

/** The selected promotion date is the first Driver day in Eastern time. */
export function defaultDriverEffectiveDate(now = new Date()) {
  const { year, month, day } = easternDateParts(now);
  return [year, String(month).padStart(2, "0"), String(day).padStart(2, "0")].join("-");
}

/** The trainee interval closes immediately before the selected first Driver day. */
export function lastTraineeDate(firstDriverDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(firstDriverDate)) return "";
  const date = new Date(`${firstDriverDate}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}
