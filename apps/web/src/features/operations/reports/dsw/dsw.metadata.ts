export function summaryScope(label: string) {
  if (/^contract\s+/i.test(label) && /\stotal$/i.test(label)) return "CONTRACT";
  if (/^colocation total$/i.test(label)) return "COLOCATION";
  return null;
}

export function contractCodeFromLabel(label: string) {
  const match = label.match(/^Contract\s+(.+?)\s+Total$/i);
  return match?.[1] ?? null;
}

export function excelDateToIso(value: string) {
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  const parts = value.split("/");
  if (parts.length === 3) {
    const [month, day, year] = parts;
    return `${year.padStart(4, "20")}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  return value;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function deriveDswSnapshotKind(serviceDate: string) {
  if (serviceDate < todayIso()) return "FINAL";
  if (serviceDate === todayIso()) return "IN_DAY";
  return "FUTURE";
}
