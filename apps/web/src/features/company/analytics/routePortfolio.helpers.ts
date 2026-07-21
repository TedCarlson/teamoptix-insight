import type { RouteCapacityRow } from "./routeCapacity.types";
import { routeCapacityNumber } from "./routeCapacity.helpers";
import type {
  RoutePortfolioDay,
  RoutePortfolioPayload,
  RoutePortfolioRoute,
  RoutePortfolioWeek,
  RouteWeekPoint,
} from "./routePortfolio.types";

function parseDate(value: string): Date {
  return new Date(`${value.slice(0, 10)}T12:00:00Z`);
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addDays(value: string, days: number): string {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDate(date);
}

function weekRange(serviceDate: string) {
  const date = parseDate(serviceDate);
  const weekStart = addDays(serviceDate, -date.getUTCDay());
  const weekEnd = addDays(weekStart, 6);

  return {
    weekKey: weekStart,
    weekStart,
    weekEnd,
  };
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

function movement(current: number | null, prior: number | null): number | null {
  if (current == null || prior == null || prior === 0) return null;
  return (current - prior) / prior;
}

function routeDisplayName(row: RouteCapacityRow): string {
  return (
    String(row.wa_number ?? "").trim() ||
    String(row.route_name ?? "").trim() ||
    row.route_key
  );
}

function toRouteDays(rows: RouteCapacityRow[]): RoutePortfolioDay[] {
  return rows
    .filter(
      (row) =>
        row.route_class === "BASELINE" ||
        row.route_class === "SUPPLEMENTAL"
    )
    .map((row) => {
      const stops = routeCapacityNumber(row.actual_delivery_stops);
      const packages = routeCapacityNumber(row.actual_delivery_packages);
      const week = weekRange(row.service_date);

      return {
        serviceDate: row.service_date,
        ...week,
        routeIdentity: row.route_key,
        routeName: routeDisplayName(row),
        waNumber: row.wa_number,
        stops,
        packages,
        packagesPerStop: ratio(packages, stops),
        routeCount: 1 as const,
        sourceStatus: "final" as const,
        routeClass: row.route_class,
        demandBand: row.baseline_band,
        historicalMedianStops:
          row.historical_median_stops == null
            ? null
            : routeCapacityNumber(row.historical_median_stops),
        historicalSampleSize: routeCapacityNumber(row.historical_sample_size),
        comparisonBasis: row.threshold_basis,
        confidence: row.confidence_level,
      };
    })
    .sort((a, b) =>
      a.serviceDate.localeCompare(b.serviceDate) ||
      a.routeIdentity.localeCompare(b.routeIdentity)
    );
}

function aggregateCompanyWeeks(days: RoutePortfolioDay[]): RoutePortfolioWeek[] {
  const byWeek = new Map<
    string,
    RoutePortfolioWeek & { serviceDates: Set<string> }
  >();

  for (const day of days) {
    const current = byWeek.get(day.weekKey) ?? {
      weekKey: day.weekKey,
      weekStart: day.weekStart,
      weekEnd: day.weekEnd,
      operatingDays: 0,
      routeInstances: 0,
      stops: 0,
      packages: 0,
      packagesPerStop: null,
      averageStopsPerRoute: null,
      averagePackagesPerRoute: null,
      serviceDates: new Set<string>(),
    };

    current.serviceDates.add(day.serviceDate);
    current.routeInstances += 1;
    current.stops += day.stops;
    current.packages += day.packages;
    byWeek.set(day.weekKey, current);
  }

  return [...byWeek.values()]
    .map(({ serviceDates, ...week }) => ({
      ...week,
      operatingDays: serviceDates.size,
      packagesPerStop: ratio(week.packages, week.stops),
      averageStopsPerRoute: ratio(week.stops, week.routeInstances),
      averagePackagesPerRoute: ratio(week.packages, week.routeInstances),
    }))
    .sort((a, b) => a.weekKey.localeCompare(b.weekKey));
}

function strongestBasis(days: RoutePortfolioDay[]): RoutePortfolioRoute["comparisonBasis"] {
  const rank: Record<RoutePortfolioRoute["comparisonBasis"], number> = {
    ROUTE_WEEKDAY: 5,
    ROUTE: 4,
    COMPANY_WEEKDAY: 3,
    COMPANY: 2,
    INSUFFICIENT_HISTORY: 1,
  };

  return days.reduce<RoutePortfolioRoute["comparisonBasis"]>(
    (best, day) =>
      rank[day.comparisonBasis] > rank[best]
        ? day.comparisonBasis
        : best,
    "INSUFFICIENT_HISTORY"
  );
}

function strongestConfidence(days: RoutePortfolioDay[]): RoutePortfolioRoute["confidence"] {
  const rank: Record<RoutePortfolioRoute["confidence"], number> = {
    HIGH: 3,
    MODERATE: 2,
    LOW: 1,
  };

  return days.reduce<RoutePortfolioRoute["confidence"]>(
    (best, day) => (rank[day.confidence] > rank[best] ? day.confidence : best),
    "LOW"
  );
}

function aggregateRoutes(
  days: RoutePortfolioDay[],
  companyWeeks: RoutePortfolioWeek[]
): RoutePortfolioRoute[] {
  const companyByWeek = new Map(companyWeeks.map((week) => [week.weekKey, week]));
  const companyStops = companyWeeks.reduce((sum, week) => sum + week.stops, 0);
  const companyPackages = companyWeeks.reduce((sum, week) => sum + week.packages, 0);
  const companyOperatingDates = new Set(days.map((day) => day.serviceDate));
  const routeDays = new Map<string, RoutePortfolioDay[]>();

  for (const day of days) {
    routeDays.set(day.routeIdentity, [
      ...(routeDays.get(day.routeIdentity) ?? []),
      day,
    ]);
  }

  return [...routeDays.entries()]
    .map(([routeIdentity, routeHistory]) => {
      const byWeek = new Map<string, RoutePortfolioDay[]>();
      for (const day of routeHistory) {
        byWeek.set(day.weekKey, [...(byWeek.get(day.weekKey) ?? []), day]);
      }

      const rawWeeks = [...byWeek.entries()]
        .map(([weekKey, weekDays]) => {
          const companyWeek = companyByWeek.get(weekKey);
          const stops = weekDays.reduce((sum, day) => sum + day.stops, 0);
          const packages = weekDays.reduce((sum, day) => sum + day.packages, 0);
          const demandBands = weekDays.map((day) => day.demandBand);
          const demandBand = demandBands.includes("EXTREME")
            ? "EXTREME"
            : demandBands.includes("HEAVY")
              ? "HEAVY"
              : demandBands.includes("LIGHT")
                ? "LIGHT"
                : demandBands.every((band) => band == null)
                  ? null
                  : demandBands.includes("NORMAL_LOW_CONFIDENCE")
                    ? "NORMAL_LOW_CONFIDENCE"
                    : "NORMAL";

          return {
            weekKey,
            weekStart: weekDays[0].weekStart,
            weekEnd: weekDays[0].weekEnd,
            routeIdentity,
            routeName: weekDays[0].routeName,
            operatingDays: weekDays.length,
            routeInstances: weekDays.length,
            stops,
            packages,
            packagesPerStop: ratio(packages, stops),
            averageStopsPerRoute: ratio(stops, weekDays.length),
            averagePackagesPerRoute: ratio(packages, weekDays.length),
            companyStops: companyWeek?.stops ?? 0,
            companyPackages: companyWeek?.packages ?? 0,
            shareOfCompanyStops: ratio(stops, companyWeek?.stops ?? 0),
            shareOfCompanyPackages: ratio(packages, companyWeek?.packages ?? 0),
            stopsWoW: null,
            packagesWoW: null,
            packagesPerStopWoW: null,
            demandBand,
            sourceCompleteness: ratio(
              weekDays.length,
              companyWeek?.operatingDays ?? weekDays.length
            ) ?? 0,
          } satisfies RouteWeekPoint;
        })
        .sort((a, b) => a.weekKey.localeCompare(b.weekKey));

      const weeks = rawWeeks.map((week, index) => {
        const previous = rawWeeks[index - 1];
        return {
          ...week,
          stopsWoW: movement(week.stops, previous?.stops ?? null),
          packagesWoW: movement(week.packages, previous?.packages ?? null),
          packagesPerStopWoW: movement(
            week.packagesPerStop,
            previous?.packagesPerStop ?? null
          ),
        };
      });

      const stops = routeHistory.reduce((sum, day) => sum + day.stops, 0);
      const packages = routeHistory.reduce((sum, day) => sum + day.packages, 0);
      const routeOperatingDates = new Set(routeHistory.map((day) => day.serviceDate));

      return {
        routeIdentity,
        routeName: routeHistory.at(-1)?.routeName ?? routeIdentity,
        waNumber: routeHistory.at(-1)?.waNumber ?? null,
        operatedDays: routeOperatingDates.size,
        observedWeeks: weeks.length,
        latestWeek: weeks.at(-1) ?? null,
        weeks,
        averageStopsPerDay: ratio(stops, routeHistory.length),
        averagePackagesPerDay: ratio(packages, routeHistory.length),
        averagePackagesPerStop: ratio(packages, stops),
        shareOfCompanyStops: ratio(stops, companyStops),
        shareOfCompanyPackages: ratio(packages, companyPackages),
        frequency:
          ratio(routeOperatingDates.size, companyOperatingDates.size) ?? 0,
        heavyWeeks: weeks.filter(
          (week) => week.demandBand === "HEAVY" || week.demandBand === "EXTREME"
        ).length,
        lightWeeks: weeks.filter((week) => week.demandBand === "LIGHT").length,
        outsideNormalWeeks: weeks.filter(
          (week) =>
            week.demandBand === "LIGHT" ||
            week.demandBand === "HEAVY" ||
            week.demandBand === "EXTREME"
        ).length,
        sourceCompleteness:
          ratio(routeOperatingDates.size, companyOperatingDates.size) ?? 0,
        comparisonBasis: strongestBasis(routeHistory),
        confidence: strongestConfidence(routeHistory),
      } satisfies RoutePortfolioRoute;
    })
    .sort((a, b) => {
      const left = a.latestWeek?.stops ?? 0;
      const right = b.latestWeek?.stops ?? 0;
      return right - left || a.routeName.localeCompare(b.routeName);
    });
}

export function buildRoutePortfolioPayload(
  rows: RouteCapacityRow[],
  startDate: string,
  endDate: string
): RoutePortfolioPayload {
  const days = toRouteDays(rows);
  const companyWeeks = aggregateCompanyWeeks(days);
  const routes = aggregateRoutes(days, companyWeeks);
  const operatingDays = new Set(days.map((day) => day.serviceDate)).size;
  const stops = days.reduce((sum, day) => sum + day.stops, 0);
  const packages = days.reduce((sum, day) => sum + day.packages, 0);
  const latestWeekKey = companyWeeks.at(-1)?.weekKey ?? null;
  const activeRoutes = latestWeekKey
    ? routes.filter((route) => route.latestWeek?.weekKey === latestWeekKey)
    : routes;

  return {
    range: { startDate, endDate },
    generatedAt: new Date().toISOString(),
    source: {
      family: "DSW",
      snapshot: "FINAL",
      dutyHoursAvailable: false,
      roadHoursAvailable: false,
      milesAvailable: false,
    },
    headline: {
      routesOperated: activeRoutes.length,
      routeInstances: days.length,
      operatingDays,
      averageStopsPerRoute: ratio(stops, days.length),
      averagePackagesPerRoute: ratio(packages, days.length),
      averagePackagesPerStop: ratio(packages, stops),
      heavyRoutes: activeRoutes.filter(
        (route) =>
          route.latestWeek?.demandBand === "HEAVY" ||
          route.latestWeek?.demandBand === "EXTREME"
      ).length,
      routesOutsideNormalRange: activeRoutes.filter(
        (route) =>
          route.latestWeek?.demandBand === "LIGHT" ||
          route.latestWeek?.demandBand === "HEAVY" ||
          route.latestWeek?.demandBand === "EXTREME"
      ).length,
      finalSourceCoverage: operatingDays > 0 ? 1 : 0,
    },
    companyWeeks,
    routes,
  };
}
