export type DayKey = "s" | "u" | "m" | "t" | "w" | "h" | "f";
export type DayCounts = Record<DayKey, number>;

export function isOn(v: boolean | null | undefined) {
  return v === true;
}

export function scheduleCellLabel(dayOn: boolean, value: string | null) {
  if (!dayOn) return "—";
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : "ON";
}

export function deltaTone(deltaValue: number, rtValue: number) {
  if (rtValue === 0) {
    if (deltaValue === 0) {
      return { color: "#64748b", background: "#f8fafc", border: "#d6dfeb" };
    }

    if (deltaValue > 0) {
      return { color: "#b54708", background: "#fffaeb", border: "#f5d38d" };
    }

    return { color: "#c62828", background: "#fef3f2", border: "#f3b3ad" };
  }

  if (deltaValue === 0) {
    return { color: "#64748b", background: "#f8fafc", border: "#d6dfeb" };
  }

  if (deltaValue < 0) {
    return { color: "#c62828", background: "#fef3f2", border: "#f3b3ad" };
  }

  if (deltaValue > rtValue * 0.1) {
    return { color: "#b54708", background: "#fffaeb", border: "#f5d38d" };
  }

  return { color: "#2f8f46", background: "#ecfdf3", border: "#a6f4c5" };
}

export function addDays(iso: string, days: number) {
  const dt = new Date(`${iso}T00:00:00`);
  dt.setDate(dt.getDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function nextWeekendDates(
  anchorDate: string | null,
  rotationMode: string | null
) {
  if (!anchorDate) return null;
  if (rotationMode !== "WEEKEND_ALT") return null;

  const first = anchorDate;
  const second = addDays(anchorDate, 14);
  return { first, second };
}