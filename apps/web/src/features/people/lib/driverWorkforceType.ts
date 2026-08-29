export type DriverProgram = "STANDARD" | "AVP";
export type DriverUtilizationCategory =
  | "FULL_TIME"
  | "PART_TIME"
  | "UNSCHEDULED";

export const DRIVER_ROLE_VALUES = {
  standard: "Driver",
  avp: "AVP Driver",
} as const;

function normalizedRole(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ");
}

export function classifyDriverProgram(
  value: string | null | undefined,
): DriverProgram | null {
  const role = normalizedRole(value);
  if (!role) return null;

  if (
    role === "avp" ||
    role === "avp driver" ||
    role === "alternative vehicle program driver"
  ) return "AVP";

  if (
    role === "driver" ||
    role === "ft driver" ||
    role === "full time driver" ||
    role === "fulltime driver" ||
    role === "lead driver"
  ) return "STANDARD";

  return null;
}

export function isDriverRole(value: string | null | undefined) {
  return classifyDriverProgram(value) != null;
}

export function deriveDriverUtilizationCategory(
  scheduledDaysPerWeek: number | null | undefined,
  fullTimeDayThreshold: number | null | undefined,
): DriverUtilizationCategory {
  const days = Number(scheduledDaysPerWeek);
  const threshold = Number(fullTimeDayThreshold);
  if (!Number.isFinite(days) || days <= 0) return "UNSCHEDULED";
  return days >= (Number.isFinite(threshold) && threshold > 0 ? threshold : 5)
    ? "FULL_TIME"
    : "PART_TIME";
}

export function driverUtilizationLabel(
  value: DriverUtilizationCategory | null | undefined,
) {
  if (value === "FULL_TIME") return "Full-time";
  if (value === "PART_TIME") return "Part-time";
  if (value === "UNSCHEDULED") return "Schedule needed";
  return "Not applicable";
}
