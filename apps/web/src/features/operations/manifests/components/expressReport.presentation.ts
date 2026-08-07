export function routeWorkAreaLabel(
  routeLabel: string | null | undefined,
  routeKey: string | null | undefined
) {
  const label = String(routeLabel ?? "").trim();
  const key = String(routeKey ?? "").trim();
  if (/available_hash_[a-f0-9]+/i.test(label)) {
    const cleanPrefix = label
      .replace(/\s*[-·]\s*available_hash_[a-f0-9]+.*$/i, "")
      .trim();
    return cleanPrefix && !/available_hash_/i.test(cleanPrefix)
      ? cleanPrefix
      : key && !/available_hash_/i.test(key)
        ? key
        : "Work area unavailable";
  }
  if (/available_hash_[a-f0-9]+/i.test(key)) {
    return label && !/available_hash_/i.test(label)
      ? label
      : "Work area unavailable";
  }
  return label || key || "Work area unavailable";
}

export function expressTimeFrameSortKey(
  begin: string | null | undefined,
  end: string | null | undefined
) {
  const minutes = (value: string | null | undefined) => {
    const match = String(value ?? "").trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (!match) return null;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    return hour <= 23 && minute <= 59 ? hour * 60 + minute : null;
  };
  const beginMinutes = minutes(begin);
  const endMinutes = minutes(end);
  const zeroWindow = beginMinutes === 0 && endMinutes === 0;
  const priority = zeroWindow ? 2 : endMinutes === null ? 1 : 0;
  // FedEx emits afternoon bounded windows such as 2 PM–4 PM as
  // 02:00–04:00, while later commitments remain in 24-hour notation. A
  // non-midnight window closing before noon is therefore an afternoon close.
  const afternoonClose =
    beginMinutes !== null && beginMinutes > 0 && endMinutes !== null && endMinutes < 12 * 60;
  const operationalEnd = afternoonClose ? endMinutes + 12 * 60 : endMinutes;
  const operationalBegin =
    afternoonClose && beginMinutes < 12 * 60
      ? beginMinutes + 12 * 60
      : beginMinutes;
  const sortableEnd = String(operationalEnd ?? 9_999).padStart(4, "0");
  const sortableBegin = String(operationalBegin ?? 9_999).padStart(4, "0");
  return `${priority}|${sortableEnd}|${sortableBegin}`;
}
