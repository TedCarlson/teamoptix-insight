const NEW_YORK_TIME_ZONE = "America/New_York";

function getNewYorkDateParts(value: Date): {
  year: number;
  month: number;
  day: number;
  weekday: number;
} {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: NEW_YORK_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });

  const parts = formatter.formatToParts(value);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const weekday = weekdayMap[values.weekday];

  if (!values.year || !values.month || !values.day || weekday === undefined) {
    throw new Error("Unable to calculate the New York billing date.");
  }

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    weekday,
  };
}

export function calculateFirstFridayAfterGoLive(value: Date = new Date()): string {
  const parts = getNewYorkDateParts(value);
  let daysUntilFriday = (5 - parts.weekday + 7) % 7;

  if (daysUntilFriday === 0) daysUntilFriday = 7;

  return new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + daysUntilFriday)
  )
    .toISOString()
    .slice(0, 10);
}

export function newYorkBillingDateToStripeAnchor(dateValue: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue);
  if (!match) throw new Error("Billing date must use YYYY-MM-DD format.");

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const calendarCheck = new Date(Date.UTC(year, month - 1, day));

  if (
    calendarCheck.getUTCFullYear() !== year ||
    calendarCheck.getUTCMonth() !== month - 1 ||
    calendarCheck.getUTCDate() !== day
  ) {
    throw new Error("Billing date is not a valid calendar date.");
  }

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: NEW_YORK_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const desiredWallClockAsUtc = Date.UTC(year, month - 1, day, 0, 0, 0);
  let instant = desiredWallClockAsUtc;

  for (let iteration = 0; iteration < 2; iteration += 1) {
    const parts = Object.fromEntries(
      formatter
        .formatToParts(new Date(instant))
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, part.value])
    );
    const observedWallClockAsUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second)
    );
    instant += desiredWallClockAsUtc - observedWallClockAsUtc;
  }

  const verification = Object.fromEntries(
    formatter
      .formatToParts(new Date(instant))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  if (
    Number(verification.year) !== year ||
    Number(verification.month) !== month ||
    Number(verification.day) !== day ||
    Number(verification.hour) !== 0 ||
    Number(verification.minute) !== 0 ||
    Number(verification.second) !== 0
  ) {
    throw new Error("Unable to convert the New York billing date to a Stripe anchor.");
  }

  return Math.floor(instant / 1000);
}
