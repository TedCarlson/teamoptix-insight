export const ANALYTICS_RANGE_PRESETS = [
  "calendar_year",
  "q1",
  "q2",
  "q3",
  "q4",
  "last_30_days",
  "last_60_days",
  "last_90_days",
] as const;

export const ANALYTICS_COMPARISON_MODES = [
  "none",
  "previous_period",
  "prior_year",
] as const;

export type AnalyticsRangePreset =
  (typeof ANALYTICS_RANGE_PRESETS)[number];

export type AnalyticsComparisonMode =
  (typeof ANALYTICS_COMPARISON_MODES)[number];

export type AnalyticsContractPeriod = {
  id: string;
  contract_number: string | null;
  terminal_identity: string | null;
  service_area: string | null;
  effective_start_date: string;
  effective_end_date: string | null;
  status: string | null;
};

export type AnalyticsCalendarSegment = AnalyticsContractPeriod & {
  calendar_year: number;
  segment_start_date: string;
  segment_end_date: string;
};

export type AnalyticsDateRange = {
  start_date: string;
  end_date: string;
};

export type ResolvedAnalyticsContext = {
  calendar_year: number;
  preset: AnalyticsRangePreset;
  contract_id: string | null;
  primary: AnalyticsDateRange;
  comparison_mode: AnalyticsComparisonMode;
  comparison: AnalyticsDateRange | null;
};

function date(value: string): Date {
  return new Date(`${value.slice(0, 10)}T12:00:00Z`);
}

function iso(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function minDate(...values: string[]): string {
  return values.reduce((minimum, value) =>
    value < minimum ? value : minimum
  );
}

function maxDate(...values: string[]): string {
  return values.reduce((maximum, value) =>
    value > maximum ? value : maximum
  );
}

function addDays(value: string, days: number): string {
  const result = date(value);
  result.setUTCDate(result.getUTCDate() + days);
  return iso(result);
}

function shiftYears(value: string, years: number): string {
  const source = date(value);
  const month = source.getUTCMonth();
  const day = source.getUTCDate();
  const target = new Date(
    Date.UTC(
      source.getUTCFullYear() + years,
      month,
      day,
      12,
      0,
      0
    )
  );

  if (target.getUTCMonth() !== month) {
    return iso(
      new Date(
        Date.UTC(
          source.getUTCFullYear() + years,
          month + 1,
          0,
          12,
          0,
          0
        )
      )
    );
  }

  return iso(target);
}

function yearRange(year: number): AnalyticsDateRange {
  return {
    start_date: `${year}-01-01`,
    end_date: `${year}-12-31`,
  };
}

function quarterRange(
  year: number,
  quarter: 1 | 2 | 3 | 4
): AnalyticsDateRange {
  const startMonth = (quarter - 1) * 3;
  const start = new Date(
    Date.UTC(year, startMonth, 1, 12, 0, 0)
  );
  const end = new Date(
    Date.UTC(year, startMonth + 3, 0, 12, 0, 0)
  );

  return {
    start_date: iso(start),
    end_date: iso(end),
  };
}

function intersectRange(
  range: AnalyticsDateRange,
  bounds: AnalyticsDateRange
): AnalyticsDateRange | null {
  const startDate = maxDate(
    range.start_date,
    bounds.start_date
  );
  const endDate = minDate(
    range.end_date,
    bounds.end_date
  );

  return startDate <= endDate
    ? { start_date: startDate, end_date: endDate }
    : null;
}

function contractBounds(
  contract: AnalyticsContractPeriod,
  today: string
): AnalyticsDateRange {
  return {
    start_date: contract.effective_start_date,
    end_date: minDate(
      contract.effective_end_date ?? today,
      today
    ),
  };
}

export function isAnalyticsRangePreset(
  value: string | null
): value is AnalyticsRangePreset {
  return ANALYTICS_RANGE_PRESETS.includes(
    value as AnalyticsRangePreset
  );
}

export function isAnalyticsComparisonMode(
  value: string | null
): value is AnalyticsComparisonMode {
  return ANALYTICS_COMPARISON_MODES.includes(
    value as AnalyticsComparisonMode
  );
}

export function buildAnalyticsCalendarSegments(
  contracts: AnalyticsContractPeriod[],
  today: string
): AnalyticsCalendarSegment[] {
  return contracts.flatMap((contract) => {
    const bounds = contractBounds(contract, today);
    const startYear = Number(bounds.start_date.slice(0, 4));
    const endYear = Number(bounds.end_date.slice(0, 4));

    if (
      !Number.isInteger(startYear) ||
      !Number.isInteger(endYear) ||
      bounds.start_date > bounds.end_date
    ) {
      return [];
    }

    const segments: AnalyticsCalendarSegment[] = [];

    for (let year = startYear; year <= endYear; year += 1) {
      const segment = intersectRange(
        yearRange(year),
        bounds
      );

      if (segment) {
        segments.push({
          ...contract,
          calendar_year: year,
          segment_start_date: segment.start_date,
          segment_end_date: segment.end_date,
        });
      }
    }

    return segments;
  });
}

function presetRange(
  year: number,
  preset: AnalyticsRangePreset,
  today: string
): AnalyticsDateRange | null {
  const elapsedYear = intersectRange(yearRange(year), {
    start_date: "0001-01-01",
    end_date: today,
  });

  if (!elapsedYear) {
    return null;
  }

  if (preset === "calendar_year") {
    return elapsedYear;
  }

  if (/^q[1-4]$/.test(preset)) {
    return intersectRange(
      quarterRange(
        year,
        Number(preset.slice(1)) as 1 | 2 | 3 | 4
      ),
      elapsedYear
    );
  }

  const dayCount = Number(
    preset.match(/^last_(30|60|90)_days$/)?.[1]
  );

  if (!Number.isFinite(dayCount)) {
    return null;
  }

  return {
    start_date: maxDate(
      elapsedYear.start_date,
      addDays(elapsedYear.end_date, -(dayCount - 1))
    ),
    end_date: elapsedYear.end_date,
  };
}

function previousPeriod(
  primary: AnalyticsDateRange,
  preset: AnalyticsRangePreset
): AnalyticsDateRange {
  if (/^q[1-4]$/.test(preset)) {
    const previousQuarterEnd = addDays(
      primary.start_date,
      -1
    );
    const previousQuarterEndDate = date(previousQuarterEnd);
    const previousQuarter =
      Math.floor(previousQuarterEndDate.getUTCMonth() / 3) + 1;

    return quarterRange(
      previousQuarterEndDate.getUTCFullYear(),
      previousQuarter as 1 | 2 | 3 | 4
    );
  }

  if (preset === "calendar_year") {
    return {
      start_date: `${Number(primary.start_date.slice(0, 4)) - 1}-01-01`,
      end_date: shiftYears(primary.end_date, -1),
    };
  }

  const previousEnd = addDays(primary.start_date, -1);
  const dayCount = Math.round(
    (date(primary.end_date).getTime() -
      date(primary.start_date).getTime()) /
      86_400_000
  ) + 1;

  return {
    start_date: addDays(previousEnd, -(dayCount - 1)),
    end_date: previousEnd,
  };
}

export function resolveAnalyticsContext({
  calendarYear,
  preset,
  comparisonMode,
  contractId,
  contracts,
  today,
}: {
  calendarYear: number;
  preset: AnalyticsRangePreset;
  comparisonMode: AnalyticsComparisonMode;
  contractId: string | null;
  contracts: AnalyticsContractPeriod[];
  today: string;
}): ResolvedAnalyticsContext | null {
  const selectedContract = contractId
    ? contracts.find((contract) => contract.id === contractId) ?? null
    : null;

  if (contractId && !selectedContract) {
    return null;
  }

  const availableSegments = buildAnalyticsCalendarSegments(
    selectedContract ? [selectedContract] : contracts,
    today
  ).filter((segment) => segment.calendar_year === calendarYear);

  if (availableSegments.length === 0) {
    return null;
  }

  const requestedPrimary = presetRange(
    calendarYear,
    preset,
    today
  );

  if (!requestedPrimary) {
    return null;
  }

  const primaryBounds: AnalyticsDateRange = selectedContract
    ? contractBounds(selectedContract, today)
    : {
        start_date: availableSegments.reduce(
          (minimum, segment) =>
            minDate(minimum, segment.segment_start_date),
          availableSegments[0].segment_start_date
        ),
        end_date: availableSegments.reduce(
          (maximum, segment) =>
            maxDate(maximum, segment.segment_end_date),
          availableSegments[0].segment_end_date
        ),
      };

  const primary = intersectRange(
    requestedPrimary,
    primaryBounds
  );

  if (!primary) {
    return null;
  }

  let comparison: AnalyticsDateRange | null = null;

  if (comparisonMode !== "none") {
    const requestedComparison =
      comparisonMode === "prior_year"
        ? {
            start_date: shiftYears(primary.start_date, -1),
            end_date: shiftYears(primary.end_date, -1),
          }
        : previousPeriod(
            /^q[1-4]$/.test(preset)
              ? requestedPrimary
              : primary,
            preset
          );

    comparison = selectedContract
      ? intersectRange(
          requestedComparison,
          contractBounds(selectedContract, today)
        )
      : requestedComparison;
  }

  return {
    calendar_year: calendarYear,
    preset,
    contract_id: selectedContract?.id ?? null,
    primary,
    comparison_mode: comparisonMode,
    comparison,
  };
}
