import type {
  PayrollActivityRow,
  PayrollDriverDayDetailRow,
  PayrollRouteCollectionItem,
} from "@/features/payroll/lib/payroll.types";

export function buildPayrollRowDetails(activityRows: PayrollActivityRow[]) {
  return [...activityRows]
    .filter((row) => row.source_kind === "DSW_ACTUAL")
    .sort((a, b) => {
      const personCompare = String(a.person_name ?? "").localeCompare(String(b.person_name ?? ""));
      if (personCompare !== 0) return personCompare;

      const dateCompare = String(a.service_date ?? "").localeCompare(String(b.service_date ?? ""));
      if (dateCompare !== 0) return dateCompare;

      return String(a.wa_number ?? "").localeCompare(String(b.wa_number ?? ""));
    });
}

function numberValue(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function buildPayrollDriverDayDetails(
  activityRows: PayrollActivityRow[]
): PayrollDriverDayDetailRow[] {
  const groups = new Map<string, PayrollActivityRow[]>();

  for (const row of activityRows) {
    if (row.source_kind !== "DSW_ACTUAL") continue;
    if (row.attendance_status !== "present") continue;
    if (!row.service_date) continue;

    const personKey = row.roster_member_id ?? row.person_name ?? "unmatched";
    const key = `${personKey}|${row.service_date}`;
    const current = groups.get(key) ?? [];
    current.push(row);
    groups.set(key, current);
  }

  return Array.from(groups.entries())
    .map(([key, rows]) => {
      const first = rows[0];
      const routeMap = new Map<string, PayrollRouteCollectionItem>();
      const flags = new Set<string>();

      for (const row of rows) {
        const wa = row.wa_number ?? "—";
        const deliveryStops = numberValue(row.actual_delivery_stops);
        const pickupStops = numberValue(row.actual_pickup_stops);
        const totalStops = deliveryStops + pickupStops;

        const current = routeMap.get(wa) ?? {
          wa_number: wa,
          route_name: row.route_name ?? null,
          row_count: 0,
          delivery_stops: 0,
          pickup_stops: 0,
          total_stops: 0,
          threshold_stops: row.threshold_stops ?? null,
          threshold_rate: row.threshold_rate ?? null,
        };

        current.row_count += 1;
        current.delivery_stops += deliveryStops;
        current.pickup_stops += pickupStops;
        current.total_stops += totalStops;
        current.threshold_stops ??= row.threshold_stops ?? null;
        current.threshold_rate ??= row.threshold_rate ?? null;

        routeMap.set(wa, current);

        for (const flag of row.review_flags ?? []) flags.add(flag);
      }

      const routeCollection = Array.from(routeMap.values()).sort((a, b) => {
        const stopCompare = b.total_stops - a.total_stops;
        if (stopCompare !== 0) return stopCompare;
        return a.wa_number.localeCompare(b.wa_number);
      });

      const dominantRoute = routeCollection[0] ?? null;
      const totalStops = routeCollection.reduce((sum, route) => sum + route.total_stops, 0);
      const thresholdStops = dominantRoute?.threshold_stops ?? null;
      const thresholdRate = dominantRoute?.threshold_rate ?? null;
      const thresholdOverage =
        thresholdStops == null ? 0 : Math.max(totalStops - thresholdStops, 0);
      const thresholdPayAmount =
        thresholdRate == null ? 0 : thresholdOverage * thresholdRate;

      const dailyPayRate = rows.reduce((max, row) => {
        if (!row.daily_pay_eligible || row.daily_pay_rate == null) return max;
        return Math.max(max, numberValue(row.daily_pay_rate));
      }, 0);

      if (routeCollection.length > 1) flags.add("MULTI_ROUTE_DAY");
      if (!dominantRoute) flags.add("NO_DOMINANT_ROUTE");
      if (thresholdStops == null || thresholdRate == null) flags.add("MISSING_THRESHOLD");

      return {
        key,
        roster_member_id: first.roster_member_id ?? null,
        person_name: first.person_name ?? "Unmatched",
        service_date: first.service_date,
        route_collection: routeCollection,
        dominant_route: dominantRoute,
        route_collection_label: routeCollection
          .map((route) => `WA ${route.wa_number}: ${route.total_stops} stops`)
          .join(" · "),
        total_stops: totalStops,
        threshold_stops: thresholdStops,
        threshold_rate: thresholdRate,
        threshold_overage: thresholdOverage,
        threshold_pay_amount: thresholdPayAmount,
        daily_pay_rate: dailyPayRate > 0 ? dailyPayRate : null,
        daily_pay_applied: dailyPayRate > 0 ? dailyPayRate : 0,
        estimated_total: thresholdPayAmount + (dailyPayRate > 0 ? dailyPayRate : 0),
        source_row_count: rows.length,
        flags: Array.from(flags).sort(),
      };
    })
    .sort((a, b) => {
      const personCompare = a.person_name.localeCompare(b.person_name);
      if (personCompare !== 0) return personCompare;
      return a.service_date.localeCompare(b.service_date);
    });
}
