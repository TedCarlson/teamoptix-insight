const EASTERN_TIME_ZONE = "America/New_York";

type DateParts = { year: number; month: number; day: number };

function zonedParts(date: Date, timeZone: string): DateParts & {
  hour: number;
  minute: number;
  second: number;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

function localMidnightUtc(parts: DateParts, timeZone: string) {
  const target = Date.UTC(parts.year, parts.month - 1, parts.day);
  let candidate = target;

  // Re-evaluate because the UTC offset can differ on the far side of a DST
  // boundary. Two passes settle the America/New_York midnight conversion.
  for (let pass = 0; pass < 3; pass += 1) {
    const actual = zonedParts(new Date(candidate), timeZone);
    const represented = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second
    );
    candidate += target - represented;
  }

  return new Date(candidate);
}

export function easternOperationalDayBounds(now = new Date()) {
  const current = zonedParts(now, EASTERN_TIME_ZONE);
  const nextDate = new Date(Date.UTC(current.year, current.month - 1, current.day + 1));
  const next = {
    year: nextDate.getUTCFullYear(),
    month: nextDate.getUTCMonth() + 1,
    day: nextDate.getUTCDate(),
  };
  const start = localMidnightUtc(current, EASTERN_TIME_ZONE);
  const end = localMidnightUtc(next, EASTERN_TIME_ZONE);

  return {
    operationalDate: `${String(current.year).padStart(4, "0")}-${String(current.month).padStart(2, "0")}-${String(current.day).padStart(2, "0")}`,
    start,
    end,
  };
}
