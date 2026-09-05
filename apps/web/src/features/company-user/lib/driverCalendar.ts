export type DriverCalendarEyebrowToken = "PEND" | "APP" | "BLK" | "C/O" | "ADD";

export type DriverCalendarEyebrowTone =
  | "pending"
  | "approved"
  | "blackout"
  | "call-out"
  | "add-in";

export type DriverCalendarEyebrow = {
  token: DriverCalendarEyebrowToken;
  tone: DriverCalendarEyebrowTone;
};

export type DriverCalendarRequestStatus =
  | "PENDING"
  | "APPROVED"
  | "DENIED"
  | "WITHDRAWN";

export type DriverCalendarRequestRow = {
  id: string;
  requested_dates: string[];
  start_date: string;
  end_date: string;
  day_count: number;
  status: DriverCalendarRequestStatus;
};

export type DriverCalendarBlackoutRow = {
  blackout_date: string;
  message: string;
};

export function addCalendarDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function isoForCalendarDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function utcCalendarDayValue(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

export function calendarDaysFromToday(isoDate: string) {
  return Math.floor(
    (utcCalendarDayValue(isoDate) -
      utcCalendarDayValue(isoForCalendarDate(new Date()))) /
      86_400_000
  );
}

export function sameCalendarDate(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function startOfFedExCalendarGrid(monthDate: Date) {
  const firstOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const offsetFromSaturday = (firstOfMonth.getDay() + 1) % 7;

  return addCalendarDays(firstOfMonth, -offsetFromSaturday);
}

export function buildRequestEyebrowMap(
  requests: DriverCalendarRequestRow[],
  blackouts: DriverCalendarBlackoutRow[] = []
) {
  const map = new Map<string, DriverCalendarEyebrow>();

  for (const request of requests) {
    if (request.status !== "PENDING" && request.status !== "APPROVED") continue;

    const eyebrow: DriverCalendarEyebrow =
      request.status === "PENDING"
        ? { token: "PEND", tone: "pending" }
        : { token: "APP", tone: "approved" };

    for (const isoDate of request.requested_dates ?? []) {
      map.set(isoDate, eyebrow);
    }
  }

  for (const blackout of blackouts) {
    map.set(blackout.blackout_date, { token: "BLK", tone: "blackout" });
  }

  return map;
}
