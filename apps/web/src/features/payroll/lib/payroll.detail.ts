import type {
  PayrollActivityRow,
  PayrollDriverDayDetailRow,
  PayrollRouteCollectionItem,
  PayrollSummaryRow,
} from "@/features/payroll/lib/payroll.types";
import {
  isDswPayrollSource,
  isFallbackWorkEventSource,
  isPayrollSource,
  payrollWorkDayKind,
} from "@/features/payroll/lib/payroll.sources";

export function buildPayrollRowDetails(activityRows: PayrollActivityRow[]) {
  return [...activityRows]
    .filter((row) => isPayrollSource(row.source_kind))
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


function sourceRowCount(row: PayrollActivityRow) {
  const raw = row.metadata_json?.source_row_count;
  const n = Number(raw ?? 1);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export function buildPayrollSummaryFromDriverDayDetails(
  rows: PayrollDriverDayDetailRow[]
): PayrollSummaryRow[] {
  const people = new Map<
    string,
    {
      roster_member_id: string | null;
      person_name: string;
      worked_days: Set<string>;
      worked_day_kinds: Map<
        string,
        "TRAINING" | "HELPER" | "WALK_ON"
      >;
      daily_pay_total: number;
      threshold_pay_total: number;
      adjustment_total: number;
    }
  >();

  for (const row of rows) {
    const personKey = row.roster_member_id ?? row.person_name;
    const person = people.get(personKey) ?? {
      roster_member_id: row.roster_member_id,
      person_name: row.person_name,
      worked_days: new Set<string>(),
      worked_day_kinds: new Map<
        string,
        "TRAINING" | "HELPER" | "WALK_ON"
      >(),
      daily_pay_total: 0,
      threshold_pay_total: 0,
      adjustment_total: 0,
    };

    person.worked_days.add(row.service_date);

    if (row.work_day_kind) {
      person.worked_day_kinds.set(
        row.service_date,
        row.work_day_kind
      );
    }

    person.daily_pay_total += row.daily_pay_applied;
    person.threshold_pay_total += row.threshold_pay_amount;
    person.adjustment_total += row.adjustment_pay_amount;

    people.set(personKey, person);
  }

  return Array.from(people.values())
    .map((person) => {
      const workedDays = Array.from(person.worked_days).sort();
      const estimatedTotal =
        person.daily_pay_total +
        person.threshold_pay_total +
        person.adjustment_total;

      return {
        roster_member_id: person.roster_member_id,
        person_name: person.person_name,
        days_worked: workedDays.length,
        worked_days: workedDays,
        worked_day_kinds: Object.fromEntries(
          person.worked_day_kinds
        ),
        daily_pay_total: person.daily_pay_total,
        threshold_pay_total: person.threshold_pay_total,
        adjustment_total: person.adjustment_total,
        estimated_total: estimatedTotal,
      };
    })
    .sort((a, b) => a.person_name.localeCompare(b.person_name));
}

export function buildPayrollDriverDayDetails(
  activityRows: PayrollActivityRow[]
): PayrollDriverDayDetailRow[] {
  const groups = new Map<string, PayrollActivityRow[]>();

  for (const row of activityRows) {
    if (!isPayrollSource(row.source_kind)) continue;
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
      const hasDswEvidence = rows.some((row) =>
        isDswPayrollSource(row.source_kind)
      );
      const hasFallbackEvidence = rows.some((row) =>
        isFallbackWorkEventSource(row.source_kind)
      );
      const hasWalkOnEvidence = rows.some(
        (row) => Boolean(
          row.metadata_json?.walk_on_payroll_event_id ||
            row.metadata_json?.walk_on_assignment_id
        )
      );
      const workDayKind = hasWalkOnEvidence
        ? "WALK_ON" as const
        : rows
            .map((row) => payrollWorkDayKind(row.source_kind))
            .find(
              (kind): kind is "TRAINING" | "HELPER" | "WALK_ON" =>
                kind != null
            ) ?? null;

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

      const nonZeroRoutes = routeCollection.filter((route) => route.total_stops > 0);
      const dominantRoute = nonZeroRoutes[0] ?? routeCollection[0] ?? null;

      // Payroll activity facts already carry the row-level payroll truth.
      // Route collections are display evidence only; do not recompute threshold
      // in the UI because the warehouse has already applied payroll policy.
      const totalStops = routeCollection.reduce((sum, route) => sum + route.total_stops, 0);
      const thresholdStops = dominantRoute?.threshold_stops ?? null;
      const thresholdRate = dominantRoute?.threshold_rate ?? null;
      const thresholdOverage = rows.reduce(
        (sum, row) => sum + numberValue(row.threshold_overage),
        0
      );
      const thresholdPayAmount = rows.reduce(
        (sum, row) => sum + numberValue(row.threshold_pay_amount),
        0
      );

      const dailyPayRate = rows.reduce((max, row) => {
        if (!row.daily_pay_eligible || row.daily_pay_rate == null) return max;
        return Math.max(max, numberValue(row.daily_pay_rate));
      }, 0);

      const adjustmentPayAmount = rows.reduce(
        (sum, row) => sum + numberValue(row.adjustment_amount),
        0
      );

      for (const row of rows) {
        for (const label of row.adjustment_labels ?? []) {
          if (label) flags.add(`ADJUSTMENT: ${label}`);
        }
      }

      if (routeCollection.length > 1) flags.add("MULTI_ROUTE_DAY");
      if (nonZeroRoutes.length > 1) flags.add("SECONDARY_ROUTE_EVIDENCE");
      if (hasDswEvidence && !dominantRoute) flags.add("NO_DOMINANT_ROUTE");
      if (
        hasDswEvidence &&
        (thresholdStops == null || thresholdRate == null)
      ) {
        flags.add("MISSING_THRESHOLD");
      }
      if (hasFallbackEvidence) flags.add("FALLBACK_WORK_EVENT");

      return {
        key,
        roster_member_id: first.roster_member_id ?? null,
        person_name: first.person_name ?? "Unmatched",
        service_date: first.service_date,
        route_collection: routeCollection,
        dominant_route: dominantRoute,
        route_collection_label: hasFallbackEvidence
          ? rows.some((row) => row.source_kind?.includes("TRAINING"))
            ? "Training day · fallback work evidence"
            : rows.some((row) => row.source_kind?.includes("WALK_ON"))
              ? "Walk-on day · fallback work evidence"
              : "Helper day · fallback work evidence"
          : routeCollection
              .map((route) => `WA ${route.wa_number}: ${route.total_stops} stops`)
              .join(" · "),
        total_stops: totalStops,
        threshold_stops: thresholdStops,
        threshold_rate: thresholdRate,
        threshold_overage: thresholdOverage,
        threshold_pay_amount: thresholdPayAmount,
        daily_pay_rate: dailyPayRate > 0 ? dailyPayRate : null,
        daily_pay_applied: dailyPayRate > 0 ? dailyPayRate : 0,
        work_day_kind: workDayKind,
        adjustment_pay_amount: adjustmentPayAmount,
        estimated_total:
          thresholdPayAmount +
          (dailyPayRate > 0 ? dailyPayRate : 0) +
          adjustmentPayAmount,
        source_row_count: rows.reduce((sum, row) => sum + sourceRowCount(row), 0),
        flags: Array.from(flags).sort(),
      };
    })
    .sort((a, b) => {
      const personCompare = a.person_name.localeCompare(b.person_name);
      if (personCompare !== 0) return personCompare;
      return a.service_date.localeCompare(b.service_date);
    });
}
