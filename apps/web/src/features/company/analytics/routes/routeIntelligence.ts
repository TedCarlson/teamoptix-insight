import type {
  DailyRouteCapacitySummary,
  RouteCapacityBand,
  RouteCapacityConfidence,
  RouteCapacityRow,
  RouteCapacityThresholdBasis,
  RouteChallengeFact,
  RouteDriverEvidenceFact,
  ScopedRouteFact,
} from "../routeCapacity.types";
import { routeCapacityNumber } from "../routeCapacity.helpers";
import { calculatePickupReliability, type PriTier } from "../pickupReliability";

export type RouteSortMode = "workload" | "volatility" | "completion";

export type RouteWeekdayProfile = {
  weekday: number;
  runs: number;
  averageStops: number;
  averagePackages: number;
};

export type RouteProfile = {
  key: string;
  routeName: string;
  waNumber: string | null;
  lastServiceDate: string;
  lastDriverName: string | null;
  routeDays: number;
  baselineDays: number;
  supplementalDays: number;
  pickupOnlyDays: number;
  actualStops: number;
  actualPackages: number;
  actualPickupStops: number;
  averageStops: number;
  averagePackages: number;
  averagePickupStops: number;
  packagesPerStop: number | null;
  observedP10Stops: number;
  observedMedianStops: number;
  observedP90Stops: number;
  volatility: number | null;
  averageCompletion: number | null;
  averageWorkloadRatio: number | null;
  recentStopChange: number | null;
  heavyDays: number;
  extremeDays: number;
  lightDays: number;
  lowCompletionDays: number;
  confidence: RouteCapacityConfidence;
  thresholdBasis: RouteCapacityThresholdBasis;
  historicalSampleSize: number;
  baselineIdentityCoverage: number;
  bandCounts: Record<Exclude<RouteCapacityBand, null>, number>;
  weekdays: RouteWeekdayProfile[];
};

export type RouteContractSummary = {
  logicalRoutes: number;
  routeDays: number;
  baselineRouteDays: number;
  supplementalRouteDays: number;
  heavyExtremeRouteDays: number;
  baselineIdentityCoverage: number;
  routeSpecificNormCoverage: number;
  lowConfidenceRouteDays: number;
};

export type RouteMonthSummary = {
  month: string;
  operatingDays: number;
  averageBaselineRoutes: number;
  averageSupplementalRoutes: number;
  averageCapacityPressure: number | null;
  supplementalVolumeShare: number | null;
  heavyExtremeRouteDays: number;
};

export type RouteDriverEvidence = {
  rosterMemberId: string;
  driverName: string;
  fxId: string | null;
  employmentStatus: string | null;
  operatingDays: number;
  deliveryStops: number;
  deliveryPackages: number;
  pickupStops: number;
  earlyPickups: number;
  latePickups: number;
  missedPickups: number;
  exceptions: number;
  code85: number;
  dna: number;
  sendAgain: number;
  miles: number;
  roadHours: number;
  dutyHours: number;
  observedIls: number | null;
  firstServiceDate: string;
  lastServiceDate: string;
  averageStops: number;
  packagesPerStop: number | null;
  stopsPerMile: number | null;
  packagesPerMile: number | null;
  stopsPerRoadHour: number | null;
  packagesPerRoadHour: number | null;
  stopsPerDutyHour: number | null;
  packagesPerDutyHour: number | null;
  exceptionsPer100Stops: number | null;
  averageRoadHours: number | null;
  averageDutyHours: number | null;
  pri: number | null;
  priTier: PriTier | null;
  sampleQualified: boolean;
};

export type RouteChallengeProfile = {
  operatingDays: number;
  mileageDays: number;
  roadHourDays: number;
  stopsPerMile: number | null;
  packagesPerMile: number | null;
  stopsPerRoadHour: number | null;
  packagesPerRoadHour: number | null;
  stopsPerDutyHour: number | null;
  packagesPerDutyHour: number | null;
  packagesPerStop: number | null;
};

export function buildRouteChallengeProfile(
  fact: RouteChallengeFact | null | undefined
): RouteChallengeProfile | null {
  if (!fact) return null;

  const operatingDays = routeCapacityNumber(fact.operating_days);
  const deliveryStops = routeCapacityNumber(fact.delivery_stops);
  const deliveryPackages = routeCapacityNumber(fact.delivery_packages);
  const miles = routeCapacityNumber(fact.miles);
  const mileageStops = routeCapacityNumber(fact.mileage_delivery_stops);
  const mileagePackages = routeCapacityNumber(fact.mileage_delivery_packages);
  const roadHours = routeCapacityNumber(fact.road_hours);
  const roadHourStops = routeCapacityNumber(fact.road_hour_delivery_stops);
  const roadHourPackages = routeCapacityNumber(fact.road_hour_delivery_packages);
  const dutyHours = routeCapacityNumber(fact.duty_hours);

  return {
    operatingDays,
    mileageDays: routeCapacityNumber(fact.mileage_days),
    roadHourDays: routeCapacityNumber(fact.road_hour_days),
    stopsPerMile: miles > 0 ? mileageStops / miles : null,
    packagesPerMile: miles > 0 ? mileagePackages / miles : null,
    stopsPerRoadHour: roadHours > 0 ? roadHourStops / roadHours : null,
    packagesPerRoadHour: roadHours > 0 ? roadHourPackages / roadHours : null,
    stopsPerDutyHour: dutyHours > 0 ? deliveryStops / dutyHours : null,
    packagesPerDutyHour: dutyHours > 0 ? deliveryPackages / dutyHours : null,
    packagesPerStop: deliveryStops > 0 ? deliveryPackages / deliveryStops : null,
  };
}

const priTierRank: Record<PriTier, number> = {
  T1: 1,
  T2: 2,
  T3: 3,
  T4: 4,
};

export function buildRouteDriverEvidence(
  facts: RouteDriverEvidenceFact[]
): RouteDriverEvidence[] {
  return facts
    .map((fact) => {
      const operatingDays = routeCapacityNumber(fact.operating_days);
      const deliveryStops = routeCapacityNumber(fact.delivery_stops);
      const deliveryPackages = routeCapacityNumber(fact.delivery_packages);
      const pickupStops = routeCapacityNumber(fact.pickup_stops);
      const earlyPickups = routeCapacityNumber(fact.early_pickups);
      const latePickups = routeCapacityNumber(fact.late_pickups);
      const missedPickups = routeCapacityNumber(fact.potential_missed_pickups);
      const exceptions = routeCapacityNumber(fact.exceptions);
      const roadHours = routeCapacityNumber(fact.road_hours);
      const dutyHours = routeCapacityNumber(fact.duty_hours);
      const miles = routeCapacityNumber(fact.miles);
      const mileageStops = routeCapacityNumber(fact.mileage_delivery_stops);
      const mileagePackages = routeCapacityNumber(fact.mileage_delivery_packages);
      const roadHourStops = routeCapacityNumber(fact.road_hour_delivery_stops);
      const roadHourPackages = routeCapacityNumber(fact.road_hour_delivery_packages);
      const reliability = calculatePickupReliability({
        pickupStops,
        earlyPickups,
        latePickups,
        potentialMissedPickups: missedPickups,
        complete: pickupStops > 0,
      });

      return {
        rosterMemberId: fact.roster_member_id,
        driverName: fact.driver_name,
        fxId: fact.fx_id,
        employmentStatus: fact.employment_status ?? null,
        operatingDays,
        deliveryStops,
        deliveryPackages,
        pickupStops,
        earlyPickups,
        latePickups,
        missedPickups,
        exceptions,
        code85: routeCapacityNumber(fact.code_85),
        dna: routeCapacityNumber(fact.dna),
        sendAgain: routeCapacityNumber(fact.send_again),
        miles,
        roadHours,
        dutyHours,
        observedIls: fact.observed_ils == null
          ? null
          : routeCapacityNumber(fact.observed_ils),
        firstServiceDate: fact.first_service_date,
        lastServiceDate: fact.last_service_date,
        averageStops: operatingDays > 0 ? deliveryStops / operatingDays : 0,
        packagesPerStop: deliveryStops > 0 ? deliveryPackages / deliveryStops : null,
        stopsPerMile: miles > 0 ? mileageStops / miles : null,
        packagesPerMile: miles > 0 ? mileagePackages / miles : null,
        stopsPerRoadHour: roadHours > 0 ? roadHourStops / roadHours : null,
        packagesPerRoadHour: roadHours > 0 ? roadHourPackages / roadHours : null,
        stopsPerDutyHour: dutyHours > 0 ? deliveryStops / dutyHours : null,
        packagesPerDutyHour: dutyHours > 0 ? deliveryPackages / dutyHours : null,
        exceptionsPer100Stops: deliveryStops > 0 ? exceptions / deliveryStops * 100 : null,
        averageRoadHours: operatingDays > 0 ? roadHours / operatingDays : null,
        averageDutyHours: operatingDays > 0 ? dutyHours / operatingDays : null,
        pri: reliability.pri,
        priTier: reliability.tier,
        sampleQualified: operatingDays >= 3,
      } satisfies RouteDriverEvidence;
    })
    .filter((driver) => driver.dutyHours > 0 && driver.employmentStatus?.toLowerCase() !== "former")
    .sort((a, b) => {
      if (a.sampleQualified !== b.sampleQualified) return a.sampleQualified ? -1 : 1;
      if (Boolean(a.priTier) !== Boolean(b.priTier)) return a.priTier ? -1 : 1;
      if (a.priTier && b.priTier && a.priTier !== b.priTier) {
        return priTierRank[b.priTier] - priTierRank[a.priTier];
      }
      if (a.pri != null && b.pri != null && a.pri !== b.pri) return a.pri - b.pri;
      const aExceptions = a.exceptionsPer100Stops ?? Number.POSITIVE_INFINITY;
      const bExceptions = b.exceptionsPer100Stops ?? Number.POSITIVE_INFINITY;
      if (aExceptions !== bExceptions) return aExceptions - bExceptions;
      const aDutyPace = a.stopsPerDutyHour ?? Number.NEGATIVE_INFINITY;
      const bDutyPace = b.stopsPerDutyHour ?? Number.NEGATIVE_INFINITY;
      if (aDutyPace !== bDutyPace) return bDutyPace - aDutyPace;
      const aPackagePace = a.packagesPerDutyHour ?? Number.NEGATIVE_INFINITY;
      const bPackagePace = b.packagesPerDutyHour ?? Number.NEGATIVE_INFINITY;
      if (aPackagePace !== bPackagePace) return bPackagePace - aPackagePace;
      if (a.operatingDays !== b.operatingDays) return b.operatingDays - a.operatingDays;
      return a.driverName.localeCompare(b.driverName);
    });
}

const percentile = (values: number[], fraction: number) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * fraction;
  const low = Math.floor(index);
  const high = Math.ceil(index);
  if (low === high) return sorted[low] ?? 0;
  const weight = index - low;
  return (sorted[low] ?? 0) * (1 - weight) + (sorted[high] ?? 0) * weight;
};

const average = (values: number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

const nullableAverage = (values: number[]) => (values.length ? average(values) : null);

const DAY_MS = 86_400_000;

type RouteFactWithDate = ScopedRouteFact & {
  routeKey: string;
  dateNumber: number;
  workloadStops: number;
};

function factRouteKey(fact: ScopedRouteFact): string {
  if (fact.route_baseline_id) return `BASELINE:${fact.route_baseline_id}`;
  if (fact.wa_number) return `WA:${fact.wa_number.replace(/[^A-Za-z0-9]/g, "").toUpperCase()}`;
  return `NAME:${String(fact.route_name ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase()}`;
}

function historyValues(rows: RouteFactWithDate[], currentDate: number): number[] {
  const cutoff = currentDate - 182 * DAY_MS;
  return rows
    .filter((row) => row.dateNumber >= cutoff && row.dateNumber < currentDate && row.workloadStops > 0)
    .map((row) => row.workloadStops);
}

function pushHistory(map: Map<string, RouteFactWithDate[]>, key: string, row: RouteFactWithDate) {
  const current = map.get(key) ?? [];
  current.push(row);
  map.set(key, current);
}

export function deriveRouteCapacityFromHistory(
  facts: ScopedRouteFact[]
): RouteCapacityRow[] {
  const factsByDate = new Map<string, RouteFactWithDate[]>();

  for (const fact of facts) {
    const serviceDate = fact.service_date.slice(0, 10);
    const dateNumber = Date.parse(`${serviceDate}T12:00:00Z`);
    const routeKey = factRouteKey(fact);
    const enriched: RouteFactWithDate = {
      ...fact,
      routeKey,
      dateNumber,
      workloadStops: Math.max(
        routeCapacityNumber(fact.planned_delivery_stops),
        routeCapacityNumber(fact.actual_delivery_stops)
      ),
    };
    const current = factsByDate.get(serviceDate) ?? [];
    current.push(enriched);
    factsByDate.set(serviceDate, current);
  }

  const routeWeekdayHistory = new Map<string, RouteFactWithDate[]>();
  const routeHistory = new Map<string, RouteFactWithDate[]>();
  const companyWeekdayHistory = new Map<string, RouteFactWithDate[]>();
  const companyHistory: RouteFactWithDate[] = [];
  const rows: RouteCapacityRow[] = [];

  for (const [serviceDate, dailyFacts] of [...factsByDate.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    for (const fact of dailyFacts) {
      const routeWeekday = historyValues(routeWeekdayHistory.get(`${fact.routeKey}:${fact.weekday_number}`) ?? [], fact.dateNumber);
      const route = historyValues(routeHistory.get(fact.routeKey) ?? [], fact.dateNumber);
      const companyWeekday = historyValues(companyWeekdayHistory.get(String(fact.weekday_number)) ?? [], fact.dateNumber);
      const company = historyValues(companyHistory, fact.dateNumber);
      let values: number[];
      let thresholdBasis: RouteCapacityThresholdBasis;

      if (routeWeekday.length >= 6) {
        values = routeWeekday;
        thresholdBasis = "ROUTE_WEEKDAY";
      } else if (route.length >= 12) {
        values = route;
        thresholdBasis = "ROUTE";
      } else if (companyWeekday.length >= 20) {
        values = companyWeekday;
        thresholdBasis = "COMPANY_WEEKDAY";
      } else if (company.length >= 40) {
        values = company;
        thresholdBasis = "COMPANY";
      } else {
        values = routeWeekday.length ? routeWeekday : route.length ? route : companyWeekday.length ? companyWeekday : company;
        thresholdBasis = "INSUFFICIENT_HISTORY";
      }

      const p10 = percentile(values, .1);
      const p25 = percentile(values, .25);
      const median = percentile(values, .5);
      const p75 = percentile(values, .75);
      const p90 = percentile(values, .9);
      const threshold = Math.max(15, p10, median * .4);
      const workloadRatio = median > 0 ? fact.workloadStops / median : null;
      const plannedStops = routeCapacityNumber(fact.planned_delivery_stops);
      const actualStops = routeCapacityNumber(fact.actual_delivery_stops);
      const plannedPickups = routeCapacityNumber(fact.planned_pickup_stops);
      const actualPickups = routeCapacityNumber(fact.actual_pickup_stops);
      const routeClass = fact.workloadStops <= 0 && Math.max(plannedPickups, actualPickups) > 0
        ? "PICKUP_ONLY"
        : fact.workloadStops <= 0
          ? "EXCLUDED"
          : fact.workloadStops < threshold
            ? "SUPPLEMENTAL"
            : "BASELINE";
      const confidence: RouteCapacityConfidence = routeWeekday.length >= 12
        ? "HIGH"
        : routeWeekday.length >= 6 || route.length >= 12
          ? "MODERATE"
          : "LOW";
      const baselineBand: RouteCapacityBand = routeClass !== "BASELINE"
        ? null
        : workloadRatio == null
          ? "NORMAL_LOW_CONFIDENCE"
          : workloadRatio < .75
            ? "LIGHT"
            : workloadRatio <= 1.25
              ? "NORMAL"
              : workloadRatio <= 1.5
                ? "HEAVY"
                : "EXTREME";

      rows.push({
        service_date: serviceDate,
        weekday_number: fact.weekday_number,
        route_key: fact.routeKey,
        route_baseline_id: fact.route_baseline_id,
        route_name: fact.route_name,
        wa_number: fact.wa_number,
        driver_name: fact.driver_name,
        planned_delivery_stops: plannedStops,
        actual_delivery_stops: actualStops,
        actual_delivery_packages: routeCapacityNumber(fact.actual_delivery_packages),
        planned_pickup_stops: plannedPickups,
        actual_pickup_stops: actualPickups,
        actual_pickup_packages: routeCapacityNumber(fact.actual_pickup_packages),
        classification_workload_stops: fact.workloadStops,
        historical_sample_size: values.length,
        historical_median_stops: median || null,
        historical_p10_stops: p10 || null,
        historical_p25_stops: p25 || null,
        historical_p75_stops: p75 || null,
        historical_p90_stops: p90 || null,
        effective_threshold_stops: threshold,
        threshold_basis: thresholdBasis,
        confidence_level: confidence,
        workload_ratio: workloadRatio,
        planned_workload_ratio: median > 0 ? plannedStops / median : null,
        executed_workload_ratio: median > 0 ? actualStops / median : null,
        route_equivalent: workloadRatio,
        planned_route_equivalent: median > 0 ? plannedStops / median : null,
        executed_route_equivalent: median > 0 ? actualStops / median : null,
        completion_ratio: plannedStops > 0 ? actualStops / plannedStops : null,
        route_class: routeClass,
        baseline_band: baselineBand,
      });
    }

    for (const fact of dailyFacts) {
      pushHistory(routeWeekdayHistory, `${fact.routeKey}:${fact.weekday_number}`, fact);
      pushHistory(routeHistory, fact.routeKey, fact);
      pushHistory(companyWeekdayHistory, String(fact.weekday_number), fact);
      companyHistory.push(fact);
    }
  }

  return rows;
}

function preferredIdentity(rows: RouteCapacityRow[]) {
  const latest = [...rows].sort((a, b) => b.service_date.localeCompare(a.service_date))[0];
  return {
    routeName: latest?.route_name?.trim() || latest?.wa_number?.trim() || "Unidentified route",
    waNumber: latest?.wa_number?.trim() || null,
    lastServiceDate: latest?.service_date ?? "",
    lastDriverName: latest?.driver_name?.trim() || null,
  };
}

function mostCommon<T extends string>(values: T[], fallback: T): T {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? fallback;
}

export function buildRouteProfiles(rows: RouteCapacityRow[]): RouteProfile[] {
  const groups = new Map<string, RouteCapacityRow[]>();

  for (const row of rows) {
    const current = groups.get(row.route_key) ?? [];
    current.push(row);
    groups.set(row.route_key, current);
  }

  return [...groups.entries()].map(([key, routeRows]) => {
    const identity = preferredIdentity(routeRows);
    const dispatched = routeRows.filter((row) => row.route_class === "BASELINE" || row.route_class === "SUPPLEMENTAL");
    const baseline = routeRows.filter((row) => row.route_class === "BASELINE");
    const stopValues = dispatched.map((row) => routeCapacityNumber(row.actual_delivery_stops));
    const actualStops = stopValues.reduce((sum, value) => sum + value, 0);
    const actualPackages = dispatched.reduce((sum, row) => sum + routeCapacityNumber(row.actual_delivery_packages), 0);
    const actualPickupStops = routeRows.reduce((sum, row) => sum + routeCapacityNumber(row.actual_pickup_stops), 0);
    const completionValues = baseline
      .filter((row) => row.completion_ratio != null)
      .map((row) => routeCapacityNumber(row.completion_ratio));
    const workloadValues = baseline
      .filter((row) => row.workload_ratio != null)
      .map((row) => routeCapacityNumber(row.workload_ratio));
    const observedMedianStops = percentile(stopValues, 0.5);
    const observedP10Stops = percentile(stopValues, 0.1);
    const observedP90Stops = percentile(stopValues, 0.9);
    const recent = [...dispatched].sort((a, b) => a.service_date.localeCompare(b.service_date));
    const recentStopChange = recent.length >= 8
      ? (() => {
          const current = recent.slice(-4).map((row) => routeCapacityNumber(row.actual_delivery_stops));
          const prior = recent.slice(-8, -4).map((row) => routeCapacityNumber(row.actual_delivery_stops));
          const priorAverage = average(prior);
          return priorAverage > 0 ? average(current) / priorAverage - 1 : null;
        })()
      : null;
    const weekdayGroups = new Map<number, RouteCapacityRow[]>();
    for (const row of dispatched) {
      const current = weekdayGroups.get(row.weekday_number) ?? [];
      current.push(row);
      weekdayGroups.set(row.weekday_number, current);
    }
    const weekdays = [...weekdayGroups.entries()]
      .map(([weekday, weekdayRows]) => ({
        weekday,
        runs: weekdayRows.length,
        averageStops: average(weekdayRows.map((row) => routeCapacityNumber(row.actual_delivery_stops))),
        averagePackages: average(weekdayRows.map((row) => routeCapacityNumber(row.actual_delivery_packages))),
      }))
      .sort((a, b) => a.weekday - b.weekday);
    const bandCounts: RouteProfile["bandCounts"] = {
      LIGHT: 0,
      NORMAL: 0,
      NORMAL_LOW_CONFIDENCE: 0,
      HEAVY: 0,
      EXTREME: 0,
    };
    for (const row of baseline) {
      if (row.baseline_band) bandCounts[row.baseline_band] += 1;
    }

    return {
      key,
      ...identity,
      routeDays: dispatched.length,
      baselineDays: baseline.length,
      supplementalDays: routeRows.filter((row) => row.route_class === "SUPPLEMENTAL").length,
      pickupOnlyDays: routeRows.filter((row) => row.route_class === "PICKUP_ONLY").length,
      actualStops,
      actualPackages,
      actualPickupStops,
      averageStops: average(stopValues),
      averagePackages: dispatched.length ? actualPackages / dispatched.length : 0,
      averagePickupStops: routeRows.length ? actualPickupStops / routeRows.length : 0,
      packagesPerStop: actualStops > 0 ? actualPackages / actualStops : null,
      observedP10Stops,
      observedMedianStops,
      observedP90Stops,
      volatility: observedMedianStops > 0 ? (observedP90Stops - observedP10Stops) / observedMedianStops : null,
      averageCompletion: nullableAverage(completionValues),
      averageWorkloadRatio: nullableAverage(workloadValues),
      recentStopChange,
      heavyDays: bandCounts.HEAVY,
      extremeDays: bandCounts.EXTREME,
      lightDays: bandCounts.LIGHT,
      lowCompletionDays: completionValues.filter((value) => value < 0.75).length,
      confidence: mostCommon(baseline.map((row) => row.confidence_level), "LOW"),
      thresholdBasis: mostCommon(baseline.map((row) => row.threshold_basis), "INSUFFICIENT_HISTORY"),
      historicalSampleSize: Math.max(0, ...baseline.map((row) => routeCapacityNumber(row.historical_sample_size))),
      baselineIdentityCoverage: routeRows.length
        ? routeRows.filter((row) => Boolean(row.route_baseline_id)).length / routeRows.length
        : 0,
      bandCounts,
      weekdays,
    };
  });
}

export function sortRouteProfiles(profiles: RouteProfile[], mode: RouteSortMode) {
  return [...profiles].sort((a, b) => {
    if (mode === "volatility") return (b.volatility ?? -1) - (a.volatility ?? -1) || b.routeDays - a.routeDays;
    if (mode === "completion") return (a.averageCompletion ?? 2) - (b.averageCompletion ?? 2) || b.routeDays - a.routeDays;
    return (b.extremeDays * 3 + b.heavyDays * 2 + b.lowCompletionDays) -
      (a.extremeDays * 3 + a.heavyDays * 2 + a.lowCompletionDays) ||
      (b.averageWorkloadRatio ?? 0) - (a.averageWorkloadRatio ?? 0) || b.routeDays - a.routeDays;
  });
}

export function summarizeRouteContract(rows: RouteCapacityRow[]): RouteContractSummary {
  const dispatched = rows.filter((row) => row.route_class === "BASELINE" || row.route_class === "SUPPLEMENTAL");
  const baseline = rows.filter((row) => row.route_class === "BASELINE");
  return {
    logicalRoutes: new Set(dispatched.map((row) => row.route_key)).size,
    routeDays: dispatched.length,
    baselineRouteDays: baseline.length,
    supplementalRouteDays: dispatched.filter((row) => row.route_class === "SUPPLEMENTAL").length,
    heavyExtremeRouteDays: baseline.filter((row) => row.baseline_band === "HEAVY" || row.baseline_band === "EXTREME").length,
    baselineIdentityCoverage: dispatched.length
      ? dispatched.filter((row) => Boolean(row.route_baseline_id)).length / dispatched.length
      : 0,
    routeSpecificNormCoverage: baseline.length
      ? baseline.filter((row) => row.threshold_basis === "ROUTE_WEEKDAY" || row.threshold_basis === "ROUTE").length / baseline.length
      : 0,
    lowConfidenceRouteDays: baseline.filter((row) => row.confidence_level === "LOW").length,
  };
}

export function summarizeRouteMonths(days: DailyRouteCapacitySummary[]): RouteMonthSummary[] {
  const groups = new Map<string, DailyRouteCapacitySummary[]>();
  for (const day of days) {
    const month = day.service_date.slice(0, 7);
    const current = groups.get(month) ?? [];
    current.push(day);
    groups.set(month, current);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, monthDays]) => {
    const pressure = monthDays.flatMap((day) => day.capacity_pressure_index == null ? [] : [day.capacity_pressure_index]);
    const supplementalShare = monthDays.flatMap((day) => day.supplemental_volume_share == null ? [] : [day.supplemental_volume_share]);
    return {
      month,
      operatingDays: monthDays.length,
      averageBaselineRoutes: average(monthDays.map((day) => day.baseline_route_count)),
      averageSupplementalRoutes: average(monthDays.map((day) => day.supplemental_route_count)),
      averageCapacityPressure: nullableAverage(pressure),
      supplementalVolumeShare: nullableAverage(supplementalShare),
      heavyExtremeRouteDays: monthDays.reduce((sum, day) => sum + day.heavy_baseline_count + day.extreme_baseline_count, 0),
    };
  });
}
