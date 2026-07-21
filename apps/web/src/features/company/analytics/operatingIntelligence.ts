import type { OperationsHistoryRow } from "./operationsHistory.types";

export type OperatingMode =
  | "STANDARD"
  | "SUPPLEMENTAL"
  | "HEAVY"
  | "EXCEPTIONAL";

export type CalendarOverlayKind = "PEAK_SEASON" | "PEAK_RAMP";

export type CalendarOverlay = {
  key: string;
  kind: CalendarOverlayKind;
  label: string;
  startDate: string;
  endDate: string;
};

export type OperatingDayPoint = {
  serviceDate: string;
  routeCount: number;
  totalStops: number;
  totalPackages: number;
  mode: OperatingMode;
  signal: "SUPPLEMENTAL_OPERATION" | "CAPACITY_INTERVENTION" | null;
};

export type OperatingWeekPoint = {
  weekKey: string;
  weekStart: string;
  weekEnd: string;
  label: string;
  operatingDays: number;
  routeCount: number;
  averageRoutes: number;
  totalStops: number;
  totalPackages: number;
  standardDays: number;
  supplementalDays: number;
  heavyDays: number;
  exceptionalDays: number;
};

export type OperatingIntelligenceDataset = {
  days: OperatingDayPoint[];
  weeks: OperatingWeekPoint[];
  overlays: CalendarOverlay[];
  reference: {
    medianRoutes: number;
    medianStops: number;
    medianPackages: number;
  };
};

function numeric(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function median(values: number[]): number {
  const sorted = values
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right);

  if (sorted.length === 0) {
    return 0;
  }

  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseDate(value: string): Date {
  return new Date(`${value.slice(0, 10)}T12:00:00Z`);
}

function startOfOperatingWeek(serviceDate: string): Date {
  const date = parseDate(serviceDate);
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return date;
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function thanksgivingDate(year: number): Date {
  const novemberFirst = new Date(Date.UTC(year, 10, 1, 12));
  const daysUntilThursday = (4 - novemberFirst.getUTCDay() + 7) % 7;
  return addDays(novemberFirst, daysUntilThursday + 21);
}

function buildPeakSeasonOverlays(days: OperatingDayPoint[]): CalendarOverlay[] {
  if (days.length === 0) return [];

  const firstDate = days[0].serviceDate;
  const lastDate = days[days.length - 1].serviceDate;
  const firstYear = parseDate(firstDate).getUTCFullYear();
  const lastYear = parseDate(lastDate).getUTCFullYear();
  const overlays: CalendarOverlay[] = [];

  for (let year = firstYear; year <= lastYear; year += 1) {
    const startDate = isoDate(thanksgivingDate(year));
    const endDate = `${year}-12-25`;

    if (endDate < firstDate || startDate > lastDate) continue;

    overlays.push({
      key: `peak-season-${year}`,
      kind: "PEAK_SEASON",
      label: `Peak Season ${year}`,
      startDate,
      endDate,
    });
  }

  return overlays;
}

function buildPeakRampOverlays(weeks: OperatingWeekPoint[]): CalendarOverlay[] {
  if (weeks.length < 5) return [];
  const overlays: CalendarOverlay[] = [];
  for (let index = 3; index < weeks.length; index += 1) {
    const window = weeks.slice(index - 3, index + 1);
    const stopsRising = window.every((week, offset) => offset === 0 || week.totalStops >= window[offset - 1].totalStops * 0.97);
    const packagesRising = window.every((week, offset) => offset === 0 || week.totalPackages >= window[offset - 1].totalPackages * 0.97);
    const stopGrowth = window[0].totalStops > 0 ? window.at(-1)!.totalStops / window[0].totalStops - 1 : 0;
    const packageGrowth = window[0].totalPackages > 0 ? window.at(-1)!.totalPackages / window[0].totalPackages - 1 : 0;
    if ((stopsRising || packagesRising) && stopGrowth >= 0.1 && packageGrowth >= 0.1) {
      const start = window[0];
      let endIndex = index;
      while (endIndex + 1 < weeks.length && weeks[endIndex + 1].totalStops >= weeks[endIndex].totalStops * 0.92) endIndex += 1;
      overlays.push({ key: `peak-ramp-${start.weekStart}`, kind: "PEAK_RAMP", label: "Demand ramp", startDate: start.weekStart, endDate: weeks[endIndex].weekEnd });
      index = endIndex;
    }
  }
  return overlays;
}

function classifyDay(
  routeCount: number,
  totalStops: number,
  totalPackages: number,
  medianRoutes: number,
  medianStops: number,
  medianPackages: number
): OperatingMode {
  if (routeCount <= 0) {
    return "EXCEPTIONAL";
  }

  if (medianRoutes > 0 && routeCount <= Math.max(2, medianRoutes * 0.35)) {
    return "SUPPLEMENTAL";
  }

  if (
    (medianRoutes > 0 && routeCount >= medianRoutes * 1.2) ||
    (medianStops > 0 && totalStops >= medianStops * 1.25) ||
    (medianPackages > 0 && totalPackages >= medianPackages * 1.25)
  ) {
    return "HEAVY";
  }

  return "STANDARD";
}

export function buildOperatingIntelligenceDataset(
  rows: OperationsHistoryRow[]
): OperatingIntelligenceDataset {
  const rawDays = rows
    .map((row) => ({
      serviceDate: String(row.service_date ?? "").slice(0, 10),
      routeCount: numeric(row.route_count),
      totalStops: numeric(row.total_stops),
      totalPackages: numeric(row.total_packages),
    }))
    .filter((row) => Boolean(row.serviceDate))
    .sort((left, right) => left.serviceDate.localeCompare(right.serviceDate));

  const medianRoutes = median(rawDays.map((day) => day.routeCount));
  const medianStops = median(rawDays.map((day) => day.totalStops));
  const medianPackages = median(rawDays.map((day) => day.totalPackages));

  const days: OperatingDayPoint[] = rawDays.map((day) => {
    const mode = classifyDay(
      day.routeCount,
      day.totalStops,
      day.totalPackages,
      medianRoutes,
      medianStops,
      medianPackages
    );
    const weekday = parseDate(day.serviceDate).getUTCDay();
    const supplemental = mode === "SUPPLEMENTAL" && (weekday === 0 || weekday === 6);
    const capacityIntervention = mode === "HEAVY" && medianRoutes > 0 && day.routeCount >= medianRoutes * 1.2 && medianStops > 0 && day.totalStops / day.routeCount <= (medianStops / medianRoutes) * 0.92;
    return { ...day, mode, signal: supplemental ? "SUPPLEMENTAL_OPERATION" : capacityIntervention ? "CAPACITY_INTERVENTION" : null };
  });

  const weeks = new Map<string, OperatingWeekPoint>();

  for (const day of days) {
    const weekStartDate = startOfOperatingWeek(day.serviceDate);
    const weekStart = isoDate(weekStartDate);
    const weekEnd = isoDate(addDays(weekStartDate, 6));
    const current = weeks.get(weekStart) ?? {
      weekKey: weekStart,
      weekStart,
      weekEnd,
      label: new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }).format(weekStartDate),
      operatingDays: 0,
      routeCount: 0,
      averageRoutes: 0,
      totalStops: 0,
      totalPackages: 0,
      standardDays: 0,
      supplementalDays: 0,
      heavyDays: 0,
      exceptionalDays: 0,
    };

    current.operatingDays += 1;
    current.routeCount += day.routeCount;
    current.totalStops += day.totalStops;
    current.totalPackages += day.totalPackages;

    if (day.mode === "STANDARD") current.standardDays += 1;
    if (day.mode === "SUPPLEMENTAL") current.supplementalDays += 1;
    if (day.mode === "HEAVY") current.heavyDays += 1;
    if (day.mode === "EXCEPTIONAL") current.exceptionalDays += 1;

    weeks.set(weekStart, current);
  }

  const weekRows = [...weeks.values()]
    .sort((left, right) => left.weekStart.localeCompare(right.weekStart))
    .map((week) => ({
      ...week,
      averageRoutes:
        week.operatingDays > 0 ? week.routeCount / week.operatingDays : 0,
    }));

  return {
    days,
    weeks: weekRows,
    overlays: [...buildPeakRampOverlays(weekRows), ...buildPeakSeasonOverlays(days)],
    reference: {
      medianRoutes,
      medianStops,
      medianPackages,
    },
  };
}
