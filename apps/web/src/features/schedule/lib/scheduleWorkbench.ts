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

export type RotationDayFlagKey =
  | "rotation_works_s"
  | "rotation_works_u"
  | "rotation_works_m"
  | "rotation_works_t"
  | "rotation_works_w"
  | "rotation_works_h"
  | "rotation_works_f";

export type RotationLifecycleInput = {
  rotation_mode: string;
  anchor_date: string;
  rotation_works_s: boolean;
  rotation_works_u: boolean;
  rotation_works_m: boolean;
  rotation_works_t: boolean;
  rotation_works_w: boolean;
  rotation_works_h: boolean;
  rotation_works_f: boolean;
};

const ROTATION_DAY_FLAGS: Array<{
  label: string;
  dow: number;
  key: RotationDayFlagKey;
}> = [
  { label: "Sun", dow: 0, key: "rotation_works_u" },
  { label: "Mon", dow: 1, key: "rotation_works_m" },
  { label: "Tue", dow: 2, key: "rotation_works_t" },
  { label: "Wed", dow: 3, key: "rotation_works_w" },
  { label: "Thu", dow: 4, key: "rotation_works_h" },
  { label: "Fri", dow: 5, key: "rotation_works_f" },
  { label: "Sat", dow: 6, key: "rotation_works_s" },
];

function isoDow(iso: string) {
  return new Date(`${iso}T00:00:00`).getDay();
}

function rotationBucket(dateIso: string, anchorIso: string) {
  const diffMs =
    new Date(`${dateIso}T00:00:00`).getTime() -
    new Date(`${anchorIso}T00:00:00`).getTime();

  const diffDays = Math.floor(diffMs / 86400000);
  return Math.floor(diffDays / 7);
}

export function rotationLifecyclePreview(input: RotationLifecycleInput) {
  if (input.rotation_mode === "NONE" || !input.anchor_date) {
    return [];
  }

  const activeFlags = ROTATION_DAY_FLAGS.filter((flag) => input[flag.key]);

  if (activeFlags.length === 0) {
    return [];
  }

  const rows: Array<{
    iso: string;
    label: string;
    state: "ON" | "OFF";
  }> = [];

  let cursor = input.anchor_date;
  let guard = 0;

  while (rows.length < 8 && guard < 90) {
    const dow = isoDow(cursor);
    const matched = activeFlags.find((flag) => flag.dow === dow);

    if (matched) {
      const bucket = rotationBucket(cursor, input.anchor_date);
      rows.push({
        iso: cursor,
        label: matched.label,
        state: bucket % 2 === 0 ? "OFF" : "ON",
      });
    }

    cursor = addDays(cursor, 1);
    guard += 1;
  }

  return rows;
}
