export type TimekeepingOversightMode =
  | "off"
  | "signal_only"
  | "driver_correction"
  | "blocking";

export type DriverTimekeepingDiscrepancyType = "MISSING_CLOCK_OUT";

export type DriverTimekeepingDiscrepancy = {
  id: string;
  type: DriverTimekeepingDiscrepancyType;
  service_date: string;
  roster_member_id: string;
  clock_in: string;
  clock_out: null;
  title: string;
  message: string;
  required_fields: string[];
};

type ActivityEvent = {
  id: string;
  event_type: string;
  service_date: string;
  occurred_at: string;
  roster_member_id: string | null;
};

export function isDriverCorrectionMode(mode: TimekeepingOversightMode) {
  return mode === "driver_correction" || mode === "blocking";
}

export function cleanTimekeepingOversightMode(value: unknown): TimekeepingOversightMode {
  return value === "signal_only" || value === "driver_correction" || value === "blocking"
    ? value
    : "off";
}

export function deriveMissingClockOutDiscrepancies(
  events: ActivityEvent[],
  currentServiceDate: string
): DriverTimekeepingDiscrepancy[] {
  const grouped = new Map<string, ActivityEvent[]>();

  for (const event of events) {
    if (!event.roster_member_id) continue;
    if (event.service_date >= currentServiceDate) continue;

    const key = `${event.roster_member_id}|${event.service_date}`;
    const rows = grouped.get(key) ?? [];
    rows.push(event);
    grouped.set(key, rows);
  }

  const discrepancies: DriverTimekeepingDiscrepancy[] = [];

  for (const [key, rows] of grouped.entries()) {
    const [rosterMemberId, serviceDate] = key.split("|");
    const sorted = [...rows].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
    const clockIn = sorted.find((event) => event.event_type === "CLOCK_IN") ?? null;

    if (!clockIn) continue;

    const laterClockOut = sorted.find(
      (event) =>
        event.event_type === "CLOCK_OUT" &&
        new Date(event.occurred_at).getTime() > new Date(clockIn.occurred_at).getTime()
    );

    if (laterClockOut) continue;

    discrepancies.push({
      id: `missing-clock-out:${rosterMemberId}:${serviceDate}`,
      type: "MISSING_CLOCK_OUT",
      service_date: serviceDate,
      roster_member_id: rosterMemberId,
      clock_in: clockIn.occurred_at,
      clock_out: null,
      title: "Missing clock out",
      message: `You clocked in on ${serviceDate} but did not clock out. Enter the time you finished work so your time record can close.`,
      required_fields: ["clock_out_time"],
    });
  }

  return discrepancies.sort((a, b) => a.service_date.localeCompare(b.service_date));
}
