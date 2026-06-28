export function addDaysIso(dateIso: string, days: number) {
  const date = new Date(`${dateIso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function payrollWeekEndFriday(dateIso: string) {
  const date = new Date(`${dateIso}T00:00:00Z`);
  const dow = date.getUTCDay();
  return addDaysIso(dateIso, (5 - dow + 7) % 7);
}

export function payrollWeekStartFor(dateIso: string) {
  return addDaysIso(payrollWeekEndFriday(dateIso), -6);
}
