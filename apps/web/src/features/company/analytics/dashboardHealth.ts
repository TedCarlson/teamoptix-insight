import type { OperationsHistoryRow } from "./operationsHistory.types";
import {
  calculatePickupReliability,
  type PriTier,
} from "./pickupReliability";
import type { WorkforceResignationNotice } from "./workforce/resignationNotice";

export type DashboardHealthStatus = "critical" | "watch" | "healthy" | "emerging";

export type DashboardWindowMetrics = {
  start: string | null;
  end: string | null;
  weeks: number;
  operatingDays: number;
  operatingDaysPerWeek: number;
  routeDaysPerWeek: number;
  routesPerDay: number;
  deliveryStopsPerDay: number;
  deliveryPackagesPerDay: number;
  pickupStopsPerDay: number;
  pickupStops: number;
  earlyPickups: number;
  latePickups: number;
  potentialMissedPickups: number;
  pickupReliabilityComplete: boolean;
  deliveryStopsPerRoute: number;
  deliveryPackagesPerRoute: number;
  packagesPerStop: number;
  serviceCodes: number;
  serviceCodesPerThousandPackages: number | null;
  ilsPercent: number | null;
  pickupPri: number | null;
  pickupTier: PriTier | null;
};

export type DashboardWindowChanges = {
  stopsPerDay: number | null;
  packagesPerDay: number | null;
  routesPerDay: number | null;
  stopsPerRoute: number | null;
  packagesPerRoute: number | null;
  serviceCodeRate: number | null;
  ilsPoints: number | null;
};

export type DashboardPeriodComparison = {
  current: DashboardWindowMetrics | null;
  baseline: DashboardWindowMetrics | null;
  changes: DashboardWindowChanges | null;
  weekdays: number[];
};

export type DashboardCurrentDay = {
  weekday: number;
  serviceDate: string;
  elapsed: boolean;
  current: DashboardWindowMetrics | null;
  baseline: DashboardWindowMetrics | null;
  changes: DashboardWindowChanges | null;
};

export type DashboardHealthSuggestion = {
  key: string;
  level: DashboardHealthStatus;
  title: string;
  detail: string;
};

export type DashboardHealth = {
  status: DashboardHealthStatus;
  label: string;
  summary: string;
  recent: DashboardWindowMetrics;
  baseline: DashboardWindowMetrics | null;
  changes: DashboardWindowChanges;
  weekend: {
    recent: DashboardWindowMetrics;
    baseline: DashboardWindowMetrics | null;
    changes: DashboardWindowChanges;
  };
  currentWeek: {
    start: string;
    end: string;
    through: string;
    weekday: DashboardPeriodComparison;
    weekend: DashboardPeriodComparison;
    days: DashboardCurrentDay[];
  } | null;
  workforce: {
    activeDrivers: number;
    trainees: number;
    fiveDayTarget: number;
    shortfall: number;
    readinessPercent: number;
    noticeResignations: WorkforceResignationNotice[];
    routeReadyDepartures: number;
    projectedActiveDrivers: number;
    projectedShortfall: number;
    projectedReadinessPercent: number;
    firstNinetyDayDrivers: number;
    firstNinetyDayShare: number;
    readinessBasis: "schedule" | "roster";
    scheduleDemandRouteDays: number;
    scheduleCoveredRouteDays: number;
    scheduleOpenRouteDays: number;
    scheduleCoveragePercent: number;
    scheduleSeamCount: number;
    partTimeDrivers: number;
    avpDrivers: number;
    routeDayEquivalents: number;
  };
  routeComposition: {
    currentRoutesPerDay: number;
    priorLoadEquivalentRoutesPerDay: number | null;
    additionalRouteEquivalent: number;
  };
  suggestions: DashboardHealthSuggestion[];
};

export type DashboardWorkforceContext = {
  active_drivers: number;
  trainees: number;
  notice_as_of?: string;
  notice_resignations?: WorkforceResignationNotice[];
  tenure: {
    new_driver_count: number;
    new_driver_share: number;
  };
  driver_utilization?: {
    full_time: number;
    part_time: number;
    unscheduled: number;
    avp: number;
    route_day_equivalents: number;
    full_time_day_threshold: number;
  };
  schedule_coverage?: {
    demandRouteDays: number;
    coveredRouteDays: number;
    openRouteDays: number;
    coveragePercent: number;
    seamCount: number;
  };
};

export type DashboardExpressContext = {
  available: boolean;
  coverage_days: number;
  packages: number;
  complete_packages?: number;
  attempted_packages?: number;
  open_packages: number;
};

type Week = {
  start: string;
  end: string;
  rows: OperationsHistoryRow[];
};

const numeric = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const availableNumber = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

function date(value: string) {
  return new Date(`${value.slice(0, 10)}T12:00:00Z`);
}

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function addDays(value: string, days: number) {
  const copy = date(value);
  copy.setUTCDate(copy.getUTCDate() + days);
  return isoDate(copy);
}

function saturdayFor(value: string) {
  const copy = date(value);
  const daysSinceSaturday = (copy.getUTCDay() + 1) % 7;
  copy.setUTCDate(copy.getUTCDate() - daysSinceSaturday);
  return isoDate(copy);
}

function completeWeeks(rows: OperationsHistoryRow[], throughDate: string) {
  const weeks = new Map<string, Week>();
  for (const row of rows) {
    const serviceDate = row.service_date.slice(0, 10);
    if (!serviceDate || serviceDate > throughDate) continue;
    const start = saturdayFor(serviceDate);
    const end = addDays(start, 6);
    if (end > throughDate) continue;
    const week = weeks.get(start) ?? { start, end, rows: [] };
    week.rows.push(row);
    weeks.set(start, week);
  }
  return Array.from(weeks.values()).sort((left, right) => left.start.localeCompare(right.start));
}

function ratio(value: number, denominator: number) {
  return denominator > 0 ? value / denominator : 0;
}

function percentChange(current: number, baseline: number) {
  if (baseline <= 0) return current > 0 ? null : 0;
  return ((current - baseline) / baseline) * 100;
}

function summarizeWindow(weeks: Week[]): DashboardWindowMetrics {
  const rows = weeks.flatMap((week) => week.rows);
  const operatingDays = rows.length;
  const routeDays = rows.reduce((sum, row) => sum + numeric(row.route_count), 0);
  const deliveryStops = rows.reduce((sum, row) => sum + numeric(row.actual_delivery_stops), 0);
  const deliveryPackages = rows.reduce((sum, row) => sum + numeric(row.actual_delivery_packages), 0);
  const pickupStops = rows.reduce((sum, row) => sum + numeric(row.actual_pickup_stops), 0);
  const early = rows.reduce((sum, row) => sum + numeric(row.early_pickups), 0);
  const late = rows.reduce((sum, row) => sum + numeric(row.late_pickups), 0);
  const missed = rows.reduce((sum, row) => sum + numeric(row.potential_missed_pickups), 0);
  const serviceCodes = rows.reduce(
    (sum, row) =>
      sum + numeric(row.code_85) + numeric(row.dna) + numeric(row.send_again),
    0
  );
  const reliability = calculatePickupReliability({
    pickupStops,
    earlyPickups: early,
    latePickups: late,
    potentialMissedPickups: missed,
    // DSW pickup exception fields are exception-only. As in the materialized
    // Driver Scorecard, a positive pickup-stop denominator establishes a valid
    // PRI sample and absent E/L/M values mean zero events. A zero-pickup day
    // inside a multi-week period must not invalidate the aggregate period.
    complete: pickupStops > 0,
  });

  const ilsRows = rows
    .map((row) => ({
      value: availableNumber(row.ils_percent),
      weight: numeric(row.ils_impact_packages),
    }))
    .filter((row): row is { value: number; weight: number } => row.value != null);
  const ilsWeight = ilsRows.reduce((sum, row) => sum + row.weight, 0);
  const ilsPercent = !ilsRows.length
    ? null
    : ilsWeight > 0
      ? ilsRows.reduce((sum, row) => sum + row.value * row.weight, 0) / ilsWeight
      : ilsRows.reduce((sum, row) => sum + row.value, 0) / ilsRows.length;

  return {
    start: weeks[0]?.start ?? null,
    end: weeks.at(-1)?.end ?? null,
    weeks: weeks.length,
    operatingDays,
    operatingDaysPerWeek: ratio(operatingDays, weeks.length),
    routeDaysPerWeek: ratio(routeDays, weeks.length),
    routesPerDay: ratio(routeDays, operatingDays),
    deliveryStopsPerDay: ratio(deliveryStops, operatingDays),
    deliveryPackagesPerDay: ratio(deliveryPackages, operatingDays),
    pickupStopsPerDay: ratio(pickupStops, operatingDays),
    pickupStops,
    earlyPickups: early,
    latePickups: late,
    potentialMissedPickups: missed,
    pickupReliabilityComplete: reliability.complete,
    deliveryStopsPerRoute: ratio(deliveryStops, routeDays),
    deliveryPackagesPerRoute: ratio(deliveryPackages, routeDays),
    packagesPerStop: ratio(deliveryPackages, deliveryStops),
    serviceCodes,
    serviceCodesPerThousandPackages:
      deliveryPackages > 0 ? (serviceCodes / deliveryPackages) * 1_000 : null,
    ilsPercent,
    pickupPri: reliability.pri,
    pickupTier: reliability.tier,
  };
}

function dayOfWeek(serviceDate: string) {
  return date(serviceDate).getUTCDay();
}

function windowForDayType(weeks: Week[], type: "weekday" | "weekend") {
  return weeks.map((week) => ({
    ...week,
    rows: week.rows.filter((row) => {
      const weekday = dayOfWeek(row.service_date);
      return type === "weekday"
        ? weekday >= 1 && weekday <= 5
        : weekday === 0 || weekday === 6;
    }),
  }));
}

function windowChanges(
  recent: DashboardWindowMetrics,
  baseline: DashboardWindowMetrics | null
): DashboardWindowChanges {
  return {
    stopsPerDay: baseline ? percentChange(recent.deliveryStopsPerDay, baseline.deliveryStopsPerDay) : null,
    packagesPerDay: baseline ? percentChange(recent.deliveryPackagesPerDay, baseline.deliveryPackagesPerDay) : null,
    routesPerDay: baseline ? percentChange(recent.routesPerDay, baseline.routesPerDay) : null,
    stopsPerRoute: baseline ? percentChange(recent.deliveryStopsPerRoute, baseline.deliveryStopsPerRoute) : null,
    packagesPerRoute: baseline ? percentChange(recent.deliveryPackagesPerRoute, baseline.deliveryPackagesPerRoute) : null,
    serviceCodeRate:
      baseline?.serviceCodesPerThousandPackages != null && recent.serviceCodesPerThousandPackages != null
        ? percentChange(
            recent.serviceCodesPerThousandPackages,
            baseline.serviceCodesPerThousandPackages
          )
        : null,
    ilsPoints:
      baseline?.ilsPercent != null && recent.ilsPercent != null
        ? recent.ilsPercent - baseline.ilsPercent
        : null,
  };
}

function currentPeriodComparison(
  currentWeek: Week,
  baselineWeeks: Week[],
  type: "weekday" | "weekend"
): DashboardPeriodComparison {
  const currentTyped = windowForDayType([currentWeek], type)[0];
  const weekdays = Array.from(
    new Set(currentTyped.rows.map((row) => dayOfWeek(row.service_date)))
  ).sort((left, right) => left - right);

  if (!currentTyped.rows.length) {
    return { current: null, baseline: null, changes: null, weekdays };
  }

  const observedWeekdays = new Set(weekdays);
  const matchedBaselineWeeks = baselineWeeks.map((week) => ({
    ...week,
    rows: week.rows.filter((row) => observedWeekdays.has(dayOfWeek(row.service_date))),
  }));
  const current = summarizeWindow([currentTyped]);
  const baseline = matchedBaselineWeeks.some((week) => week.rows.length)
    ? summarizeWindow(matchedBaselineWeeks)
    : null;

  return {
    current,
    baseline,
    changes: baseline ? windowChanges(current, baseline) : null,
    weekdays,
  };
}

function currentDayComparison(
  serviceDate: string,
  throughDate: string,
  currentWeek: Week,
  baselineWeeks: Week[]
): DashboardCurrentDay {
  const weekday = dayOfWeek(serviceDate);
  const currentRows = currentWeek.rows.filter(
    (row) => row.service_date.slice(0, 10) === serviceDate
  );
  const baselineRows = baselineWeeks.map((week) => ({
    ...week,
    rows: week.rows.filter((row) => dayOfWeek(row.service_date) === weekday),
  }));
  const current = currentRows.length
    ? summarizeWindow([{ start: serviceDate, end: serviceDate, rows: currentRows }])
    : null;
  const baseline = baselineRows.some((week) => week.rows.length)
    ? summarizeWindow(baselineRows)
    : null;

  return {
    weekday,
    serviceDate,
    elapsed: serviceDate <= throughDate,
    current,
    baseline,
    changes: current && baseline ? windowChanges(current, baseline) : null,
  };
}

function maxKnown(values: Array<number | null>) {
  const known = values.filter((value): value is number => value != null);
  return known.length ? Math.max(...known) : null;
}

function serviceStatus(metrics: DashboardWindowMetrics, codeChange: number | null, ilsChange: number | null) {
  if (metrics.pickupTier === "T1" || (ilsChange != null && ilsChange <= -1) || (codeChange != null && codeChange >= 25)) {
    return "critical" as const;
  }
  if (metrics.pickupTier === "T2" || metrics.pickupTier === "T3" || (ilsChange != null && ilsChange <= -0.35) || (codeChange != null && codeChange >= 10)) {
    return "watch" as const;
  }
  return "healthy" as const;
}

function worseServiceStatus(
  weekday: "critical" | "watch" | "healthy",
  weekend: "critical" | "watch" | "healthy"
) {
  if (weekday === "critical" || weekend === "critical") return "critical" as const;
  if (weekday === "watch" || weekend === "watch") return "watch" as const;
  return "healthy" as const;
}

export function buildDashboardHealth(
  rows: OperationsHistoryRow[],
  throughDate: string,
  workforce: DashboardWorkforceContext,
  express?: DashboardExpressContext | null
): DashboardHealth {
  const weeks = completeWeeks(rows, throughDate);
  const recentWeeks = weeks.slice(-5);
  const baselineWeeks = weeks.slice(-10, -5);
  const currentWeekStart = saturdayFor(throughDate);
  const currentWeekEnd = addDays(currentWeekStart, 6);
  const currentWeekRows = rows.filter((row) => {
    const serviceDate = row.service_date.slice(0, 10);
    return serviceDate >= currentWeekStart && serviceDate <= throughDate;
  });
  const inProgressWeek = currentWeekEnd > throughDate && currentWeekRows.length
    ? { start: currentWeekStart, end: currentWeekEnd, rows: currentWeekRows }
    : null;
  // Weekday and weekend operating shapes are intentionally never blended.
  // A partial or structurally lighter weekend would otherwise make weekday
  // demand look healthier than it is, especially during Peak transitions.
  const recent = summarizeWindow(windowForDayType(recentWeeks, "weekday"));
  const baseline = baselineWeeks.length
    ? summarizeWindow(windowForDayType(baselineWeeks, "weekday"))
    : null;
  const weekendRecent = summarizeWindow(windowForDayType(recentWeeks, "weekend"));
  const weekendBaseline = baselineWeeks.length
    ? summarizeWindow(windowForDayType(baselineWeeks, "weekend"))
    : null;
  const changes = windowChanges(recent, baseline);
  const weekendChanges = windowChanges(weekendRecent, weekendBaseline);
  const currentWeek = inProgressWeek
    ? {
        start: inProgressWeek.start,
        end: inProgressWeek.end,
        through: throughDate,
        weekday: currentPeriodComparison(inProgressWeek, recentWeeks, "weekday"),
        weekend: currentPeriodComparison(inProgressWeek, recentWeeks, "weekend"),
        days: Array.from({ length: 7 }, (_, offset) =>
          currentDayComparison(
            addDays(inProgressWeek.start, offset),
            throughDate,
            inProgressWeek,
            recentWeeks
          )
        ),
      }
    : null;

  const activeDrivers = workforce.active_drivers;
  const noticeResignations = workforce.notice_resignations ?? [];
  const routeReadyDepartures = noticeResignations.filter(
    (notice) => notice.route_ready_departure
  ).length;
  const projectedActiveDrivers = Math.max(0, activeDrivers - routeReadyDepartures);
  const weeklyRouteDays = recent.routeDaysPerWeek + weekendRecent.routeDaysPerWeek;
  const fiveDayTarget = weeklyRouteDays > 0
    ? Math.ceil(weeklyRouteDays / 5 * 1.125)
    : 0;
  const shortfall = Math.max(0, fiveDayTarget - activeDrivers);
  const readinessPercent = fiveDayTarget > 0 ? (activeDrivers / fiveDayTarget) * 100 : 100;
  const projectedShortfall = Math.max(0, fiveDayTarget - projectedActiveDrivers);
  const projectedReadinessPercent = fiveDayTarget > 0
    ? (projectedActiveDrivers / fiveDayTarget) * 100
    : 100;
  const scheduleCoverage = workforce.schedule_coverage;
  const hasScheduleCoverage = Number(scheduleCoverage?.demandRouteDays ?? 0) > 0;
  const operatingReadinessPercent = hasScheduleCoverage
    ? Number(scheduleCoverage?.coveragePercent ?? 0)
    : projectedReadinessPercent;

  const priorLoadEquivalentRoutesPerDay = baseline && baseline.deliveryStopsPerRoute > 0 && baseline.deliveryPackagesPerRoute > 0
    ? Math.max(
        recent.deliveryStopsPerDay / baseline.deliveryStopsPerRoute,
        recent.deliveryPackagesPerDay / baseline.deliveryPackagesPerRoute
      )
    : null;
  const additionalRouteEquivalent = priorLoadEquivalentRoutesPerDay == null
    ? 0
    : Math.max(0, Math.ceil(priorLoadEquivalentRoutesPerDay - recent.routesPerDay));

  const workloadPressure = maxKnown([changes.stopsPerRoute, changes.packagesPerRoute]);
  const currentServiceStatus = serviceStatus(
    recent,
    changes.serviceCodeRate,
    changes.ilsPoints
  );
  const weekendServiceStatus = weekendRecent.operatingDays > 0
    ? serviceStatus(
        weekendRecent,
        weekendChanges.serviceCodeRate,
        weekendChanges.ilsPoints
      )
    : "healthy";
  const combinedServiceStatus = worseServiceStatus(
    currentServiceStatus,
    weekendServiceStatus
  );
  const workforceStatus: DashboardHealthStatus = operatingReadinessPercent < 85
    ? "critical"
    : operatingReadinessPercent < 100
      ? "watch"
      : "healthy";
  const routeStatus: DashboardHealthStatus = workloadPressure != null && workloadPressure >= 10
    ? "critical"
    : workloadPressure != null && workloadPressure >= 5
      ? "watch"
      : "healthy";
  const expressStatus: DashboardHealthStatus = express?.available && express.open_packages > 0
    ? "critical"
    : express?.available && numeric(express.attempted_packages) > 0
      ? "watch"
    : express?.available
      ? "healthy"
      : "emerging";
  const statuses = [combinedServiceStatus, workforceStatus, routeStatus, expressStatus];
  const status: DashboardHealthStatus = statuses.includes("critical")
    ? "critical"
    : statuses.includes("watch")
      ? "watch"
      : statuses.includes("emerging")
        ? "emerging"
        : "healthy";

  const suggestions: DashboardHealthSuggestion[] = [];
  if (routeReadyDepartures > 0) {
    const nextNotice = noticeResignations.find((notice) => notice.route_ready_departure)!;
    suggestions.push({
      key: "off_ramp",
      level: workforceStatus,
      title: `Replace ${routeReadyDepartures} known driver departure${routeReadyDepartures === 1 ? "" : "s"} before the off-ramp`,
      detail: `${nextNotice.full_name}${routeReadyDepartures > 1 ? ` and ${routeReadyDepartures - 1} other driver${routeReadyDepartures - 1 === 1 ? "" : "s"}` : ""} ${nextNotice.days_until_last_day === 0 ? "reaches the final scheduled day today" : `has ${nextNotice.days_until_last_day} day${nextNotice.days_until_last_day === 1 ? "" : "s"} until the final scheduled day`}. Route-ready capacity is projected to move from ${activeDrivers} to ${projectedActiveDrivers}, widening the sustainable five-day gap to ${projectedShortfall}.`,
    });
  }
  if (hasScheduleCoverage && Number(scheduleCoverage?.openRouteDays ?? 0) > 0) {
    const openRouteDays = Number(scheduleCoverage?.openRouteDays ?? 0);
    suggestions.push({
      key: "workforce",
      level: workforceStatus,
      title: `Cover ${openRouteDays} open scheduled route-day${openRouteDays === 1 ? "" : "s"}`,
      detail: `${Number(scheduleCoverage?.coveredRouteDays ?? 0)} of ${Number(scheduleCoverage?.demandRouteDays ?? 0)} route-days are assigned in the schedule window. FT, PT, and AVP labels describe baseline utilization; only an actual route assignment closes route readiness.`,
    });
  } else if (!hasScheduleCoverage && projectedShortfall > 0) {
    suggestions.push({
      key: "workforce",
      level: workforceStatus,
      title: `Build ${projectedShortfall} route-ready driver${projectedShortfall === 1 ? "" : "s"} for projected capacity`,
      detail: `${activeDrivers} Active drivers cover ${weeklyRouteDays.toFixed(1)} route-days/week today; known notices move projected capacity to ${projectedActiveDrivers} against a ${fiveDayTarget}-driver sustainable five-day model. Trainees remain development capacity until route-ready.`,
    });
  }
  if (additionalRouteEquivalent > 0 || (workloadPressure != null && workloadPressure >= 5)) {
    suggestions.push({
      key: "routes",
      level: routeStatus,
      title: "Review weekday route composition before adding more load",
      detail: `Recent Monday–Friday routes carry ${recent.deliveryStopsPerRoute.toFixed(1)} delivery stops and ${recent.deliveryPackagesPerRoute.toFixed(1)} packages each. Restoring the prior five-week weekday load shape would require about ${Math.ceil(priorLoadEquivalentRoutesPerDay ?? recent.routesPerDay)} routes/day—${additionalRouteEquivalent} above current weekday deployment.`,
    });
  }
  if (currentServiceStatus !== "healthy" || weekendServiceStatus !== "healthy") {
    const codeDetail = recent.serviceCodesPerThousandPackages == null
      ? "delivery-code rate unavailable"
      : `${recent.serviceCodesPerThousandPackages.toFixed(2)} Code 85/DNA/Send Again packages per 1,000 delivered packages`;
    suggestions.push({
      key: "service",
      level: combinedServiceStatus,
      title: "Protect service while demand is being absorbed",
      detail: `Monday–Friday service shows ${codeDetail}, ${recent.ilsPercent == null ? "ILS unavailable" : `${recent.ilsPercent.toFixed(2)}% ILS`}, and ${recent.pickupTier ?? "no pickup tier"}${recent.pickupPri == null ? "" : ` at PRI ${recent.pickupPri.toFixed(3)}`}. Weekend service is evaluated independently${weekendRecent.operatingDays > 0 ? ` at ${weekendRecent.pickupTier ?? "no pickup tier"}${weekendRecent.pickupPri == null ? "" : ` / PRI ${weekendRecent.pickupPri.toFixed(3)}`}` : " with no operating sample"}. Use Route Intelligence to locate the routes contributing most to the pressure.`,
    });
  }
  if (workforce.tenure.new_driver_share >= 0.15) {
    suggestions.push({
      key: "tenure",
      level: workforce.tenure.new_driver_share >= 0.3 ? "watch" : "emerging",
      title: "Match coaching capacity to the tenure mix",
      detail: `${workforce.tenure.new_driver_count} Active drivers (${(workforce.tenure.new_driver_share * 100).toFixed(0)}%) are inside their first 90 days. Prioritize ride-alongs, pickup verification, and code review without treating tenure itself as a service failure.`,
    });
  }
  if (express?.available && express.open_packages > 0) {
    suggestions.push({
      key: "express",
      level: "critical",
      title: "Close current Express exposure",
      detail: `${numeric(express.complete_packages)} Complete · ${numeric(express.attempted_packages)} Attempted · ${express.open_packages} Open across ${express.coverage_days} recent manifest days. Each package is counted in exactly one state.`,
    });
  } else if (express?.available && numeric(express.attempted_packages) > 0) {
    suggestions.push({
      key: "express_attempted",
      level: "watch",
      title: "Review attempted Express packages",
      detail: `${numeric(express.attempted_packages)} Express package${numeric(express.attempted_packages) === 1 ? " has" : "s have"} current All Codes attempt evidence and remain incomplete.`,
    });
  }
  if (!suggestions.length) {
    suggestions.push({
      key: "maintain",
      level: "healthy",
      title: "Maintain the current operating plan",
      detail: "Recent demand, route intensity, workforce coverage, and connected service measures remain inside the current planning range.",
    });
  }

  const label = status === "critical"
    ? "Intervention needed"
    : status === "watch"
      ? "Pressure building"
      : status === "emerging"
        ? "Healthy with coverage gaps"
        : "Operating plan aligned";
  const summary = status === "critical"
    ? "At least one connected capacity or service measure has moved beyond the current operating plan."
    : status === "watch"
      ? "Demand, workload, or service is moving faster than one part of the current plan."
      : status === "emerging"
        ? "Connected measures are stable; one supporting source is still maturing."
        : "Current route deployment, workforce supply, and service results are moving together.";

  return {
    status,
    label,
    summary,
    recent,
    baseline,
    changes,
    weekend: {
      recent: weekendRecent,
      baseline: weekendBaseline,
      changes: weekendChanges,
    },
    currentWeek,
    workforce: {
      activeDrivers,
      trainees: workforce.trainees,
      fiveDayTarget,
      shortfall,
      readinessPercent,
      noticeResignations,
      routeReadyDepartures,
      projectedActiveDrivers,
      projectedShortfall,
      projectedReadinessPercent,
      firstNinetyDayDrivers: workforce.tenure.new_driver_count,
      firstNinetyDayShare: workforce.tenure.new_driver_share,
      readinessBasis: hasScheduleCoverage ? "schedule" : "roster",
      scheduleDemandRouteDays: Number(scheduleCoverage?.demandRouteDays ?? 0),
      scheduleCoveredRouteDays: Number(scheduleCoverage?.coveredRouteDays ?? 0),
      scheduleOpenRouteDays: Number(scheduleCoverage?.openRouteDays ?? 0),
      scheduleCoveragePercent: Number(scheduleCoverage?.coveragePercent ?? 100),
      scheduleSeamCount: Number(scheduleCoverage?.seamCount ?? 0),
      partTimeDrivers: Number(workforce.driver_utilization?.part_time ?? 0),
      avpDrivers: Number(workforce.driver_utilization?.avp ?? 0),
      routeDayEquivalents: Number(workforce.driver_utilization?.route_day_equivalents ?? activeDrivers),
    },
    routeComposition: {
      currentRoutesPerDay: recent.routesPerDay,
      priorLoadEquivalentRoutesPerDay,
      additionalRouteEquivalent,
    },
    suggestions,
  };
}
