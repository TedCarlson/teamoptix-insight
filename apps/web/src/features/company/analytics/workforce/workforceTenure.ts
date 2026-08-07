export type TenureRosterRecord = {
  employment_status: string | null;
  hire_date: string | null;
};

export type TenureSegment = {
  key: "under_30" | "one_to_three" | "four_to_six" | "six_to_twelve" | "over_one_year";
  label: string;
  range: string;
  managementFocus: string;
  count: number;
  share: number;
};

export type WorkforceTenureProfile = {
  as_of: string;
  active_drivers: number;
  known_tenure: number;
  missing_hire_date: number;
  new_driver_count: number;
  new_driver_share: number;
  segments: TenureSegment[];
};

const DAY_MS = 86_400_000;

const definitions: Array<Omit<TenureSegment, "count" | "share"> & { minimum: number; maximum: number }> = [
  { key: "under_30", label: "Less than 30 days", range: "0–29 days", managementFocus: "Close supervision", minimum: 0, maximum: 29 },
  { key: "one_to_three", label: "1–3 months", range: "30–90 days", managementFocus: "Weekly coaching", minimum: 30, maximum: 90 },
  { key: "four_to_six", label: "4–6 months", range: "91–180 days", managementFocus: "Reliability forming", minimum: 91, maximum: 180 },
  { key: "six_to_twelve", label: "6–12 months", range: "181–365 days", managementFocus: "Independent depth", minimum: 181, maximum: 365 },
  { key: "over_one_year", label: "More than 1 year", range: "366+ days", managementFocus: "Veteran depth", minimum: 366, maximum: Number.POSITIVE_INFINITY },
];

function validDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value.slice(0, 10))) return null;
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function buildWorkforceTenureProfile(records: TenureRosterRecord[], asOfDate: string): WorkforceTenureProfile {
  const asOf = validDate(asOfDate) ?? new Date();
  const active = records.filter((record) => record.employment_status === "Active");
  const tenureDays = active.map((record) => {
    const hireDate = validDate(record.hire_date);
    return hireDate ? Math.max(0, Math.floor((asOf.getTime() - hireDate.getTime()) / DAY_MS)) : null;
  });
  const knownTenure = tenureDays.filter((days): days is number => days != null);
  const segments = definitions.map(({ minimum, maximum, ...definition }) => {
    const count = knownTenure.filter((days) => days >= minimum && days <= maximum).length;
    return {
      ...definition,
      count,
      share: knownTenure.length ? count / knownTenure.length : 0,
    };
  });
  const newDriverCount = segments[0].count + segments[1].count;

  return {
    as_of: asOfDate,
    active_drivers: active.length,
    known_tenure: knownTenure.length,
    missing_hire_date: active.length - knownTenure.length,
    new_driver_count: newDriverCount,
    new_driver_share: knownTenure.length ? newDriverCount / knownTenure.length : 0,
    segments,
  };
}
