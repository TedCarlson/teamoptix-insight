export type MonthRange = {
  start_date: string;
  end_date: string;
};

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseIsoDate(value: string): Date {
  return new Date(`${value.slice(0, 10)}T12:00:00Z`);
}

export function buildMonthRanges(startDate: string, endDate: string): MonthRange[] {
  const ranges: MonthRange[] = [];
  let cursor = parseIsoDate(startDate);
  const finalDate = parseIsoDate(endDate);

  while (cursor <= finalDate) {
    const year = cursor.getUTCFullYear();
    const month = cursor.getUTCMonth();
    const monthStart = new Date(Date.UTC(year, month, 1, 12, 0, 0));
    const monthEnd = new Date(Date.UTC(year, month + 1, 0, 12, 0, 0));

    ranges.push({
      start_date: isoDate(monthStart) < startDate ? startDate : isoDate(monthStart),
      end_date: isoDate(monthEnd) > endDate ? endDate : isoDate(monthEnd),
    });

    cursor = new Date(Date.UTC(year, month + 1, 1, 12, 0, 0));
  }

  return ranges;
}
