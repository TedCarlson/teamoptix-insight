export type OperatingDateOverride = "OPERATING" | "CLOSED";

export type OperatingDateDecision = {
  operates: boolean;
  source: "dated_override" | "weekly_calendar";
  override: OperatingDateOverride | null;
};

export function resolveOperatingDateDecision(params: {
  operationalDate: string;
  dayOfWeek: number;
  operatingWeekdays?: unknown;
  operatingDateOverrides?: unknown;
}): OperatingDateDecision {
  const overrides =
    params.operatingDateOverrides &&
    typeof params.operatingDateOverrides === "object" &&
    !Array.isArray(params.operatingDateOverrides)
      ? (params.operatingDateOverrides as Record<string, unknown>)
      : {};
  const datedOverride = overrides[params.operationalDate];

  if (datedOverride === true || datedOverride === "OPERATING") {
    return { operates: true, source: "dated_override", override: "OPERATING" };
  }
  if (datedOverride === false || datedOverride === "CLOSED") {
    return { operates: false, source: "dated_override", override: "CLOSED" };
  }

  const weekdays = Array.isArray(params.operatingWeekdays)
    ? params.operatingWeekdays.map(Number).filter(Number.isInteger)
    : [];

  return {
    operates: weekdays.length === 0 || weekdays.includes(params.dayOfWeek),
    source: "weekly_calendar",
    override: null,
  };
}
