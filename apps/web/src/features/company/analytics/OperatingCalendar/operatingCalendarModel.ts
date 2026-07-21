import type {
  CalendarOverlay,
  OperatingDayPoint,
  OperatingMode,
} from "../operatingIntelligence";

export type CalendarOperatingMode =
  | "standard"
  | "heavy"
  | "supplemental"
  | "exceptional";

export type CalendarDay = {
  date: string;
  weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  weekIndex: number;
  monthIndex: number;
  hasHistory: boolean;
  expectedOperatingDay: boolean;
  missingFinal: boolean;
  operatingMode?: CalendarOperatingMode;
  routes?: number;
  stops?: number;
  packages?: number;
  peakSeason: boolean;
};

export type CalendarWeek = {
  key: string;
  startDate: string;
  endDate: string;
  label: string;
  weekIndex: number;
  peakSeason: boolean;
  days: CalendarDay[];
};

const MODE_MAP: Record<OperatingMode, CalendarOperatingMode> = {
  STANDARD: "standard",
  HEAVY: "heavy",
  SUPPLEMENTAL: "supplemental",
  EXCEPTIONAL: "exceptional",
};

function parseDate(value: string): Date {
  return new Date(`${value.slice(0, 10)}T12:00:00Z`);
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addDays(value: Date, amount: number): Date {
  const copy = new Date(value);
  copy.setUTCDate(copy.getUTCDate() + amount);
  return copy;
}

function startOfOperatingWeek(value: Date): Date {
  const copy = new Date(value);
  const daysSinceSaturday = (copy.getUTCDay() + 1) % 7;
  copy.setUTCDate(copy.getUTCDate() - daysSinceSaturday);
  return copy;
}

function isPeakSeason(date: string, overlays: CalendarOverlay[]): boolean {
  return overlays.some(
    (overlay) =>
      overlay.kind === "PEAK_SEASON" &&
      date >= overlay.startDate &&
      date <= overlay.endDate
  );
}

function formatWeekLabel(value: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(value);
}

export function buildOperatingCalendar({
  days,
  overlays,
  startDate,
  endDate,
  throughDate,
}: {
  days: OperatingDayPoint[];
  overlays: CalendarOverlay[];
  startDate: string;
  endDate: string;
  throughDate?: string | null;
}): CalendarWeek[] {
  if (!startDate || !endDate || endDate < startDate) return [];

  const historyByDate = new Map(days.map((day) => [day.serviceDate, day]));
  const firstWeekStart = startOfOperatingWeek(parseDate(startDate));
  const lastDate = parseDate(endDate);
  const elapsedThrough = throughDate?.slice(0, 10) || endDate;
  const weeks: CalendarWeek[] = [];

  for (
    let weekStart = firstWeekStart, weekIndex = 0;
    weekStart <= lastDate;
    weekStart = addDays(weekStart, 7), weekIndex += 1
  ) {
    const calendarDays: CalendarDay[] = [];

    for (let offset = 0; offset < 7; offset += 1) {
      const dateValue = addDays(weekStart, offset);
      const date = isoDate(dateValue);
      const weekday = dateValue.getUTCDay() as CalendarDay["weekday"];
      const history = historyByDate.get(date);
      const withinContract = date >= startDate && date <= endDate;
      const expectedOperatingDay = withinContract && weekday !== 0;

      calendarDays.push({
        date,
        weekday,
        weekIndex,
        monthIndex: dateValue.getUTCMonth(),
        hasHistory: Boolean(history),
        expectedOperatingDay,
        missingFinal:
          withinContract &&
          expectedOperatingDay &&
          date <= elapsedThrough &&
          !history,
        operatingMode: history ? MODE_MAP[history.mode] : undefined,
        routes: history?.routeCount,
        stops: history?.totalStops,
        packages: history?.totalPackages,
        peakSeason: withinContract && isPeakSeason(date, overlays),
      });
    }

    const weekEnd = addDays(weekStart, 6);
    weeks.push({
      key: isoDate(weekStart),
      startDate: isoDate(weekStart),
      endDate: isoDate(weekEnd),
      label: formatWeekLabel(weekStart),
      weekIndex,
      peakSeason: calendarDays.some((day) => day.peakSeason),
      days: calendarDays,
    });
  }

  return weeks;
}
