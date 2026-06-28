export type FccRouteHealthStatus = "healthy" | "caution" | "critical" | "nosignal";

export type FccRouteHealth = {
  status: FccRouteHealthStatus;
  label: string;
  minutesSinceLastTransmission: number | null;
  tooltip: string;
};

export type FccRouteSignalRow = {
  wa_number?: string | null;
  wa_number_normalized?: string | null;
  driver_name?: string | null;
  last_delivery_time?: string | null;
  last_pickup_time?: string | null;
  last_transmission_time?: string | null;
  deliveries_complete?: boolean | null;
  pickup_complete?: boolean | null;
  final_stop_time?: string | null;
  report_date_text?: string | null;
  export_generated_text?: string | null;
};

function cellText(value: unknown) {
  return String(value ?? "").trim();
}

function parseUsDate(value: string | null | undefined) {
  const match = cellText(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) return null;
  return `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
}

function parseClockOnDate(dateIso: string, timeText: string | null | undefined) {
  const raw = cellText(timeText);
  if (!raw) return null;

  const match = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;

  const hour = match[1].padStart(2, "0");
  const minute = match[2];
  const second = (match[3] ?? "00").padStart(2, "0");

  const parsed = new Date(`${dateIso}T${hour}:${minute}:${second}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatAge(minutes: number | null) {
  if (minutes === null) return "No signal";
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins ? `${hours}h ${mins}m` : `${hours}h`;
}

export function computeFccRouteHealth(row: FccRouteSignalRow | null | undefined): FccRouteHealth {
  if (!row) {
    return {
      status: "nosignal",
      label: "No FCC signal",
      minutesSinceLastTransmission: null,
      tooltip: "No FCC route signal found for this row.",
    };
  }

  const reportDate =
    parseUsDate(row.report_date_text) ??
    parseUsDate(row.export_generated_text) ??
    new Date().toISOString().slice(0, 10);

  const lastTransmission = parseClockOnDate(reportDate, row.last_transmission_time);
  const complete = Boolean(row.deliveries_complete || row.final_stop_time);

  if (!lastTransmission) {
    return {
      status: "nosignal",
      label: "No transmission",
      minutesSinceLastTransmission: null,
      tooltip: "FCC has no last transmission time for this route.",
    };
  }

  const minutes = Math.max(0, Math.floor((Date.now() - lastTransmission.getTime()) / 60000));

  let status: FccRouteHealthStatus = "healthy";
  if (minutes > 45 && !complete) status = "critical";
  else if (minutes > 20 && !complete) status = "caution";

  return {
    status,
    label: `Last signal ${formatAge(minutes)} ago`,
    minutesSinceLastTransmission: minutes,
    tooltip: [
      `Last signal: ${formatAge(minutes)} ago`,
      row.last_delivery_time ? `Last delivery: ${row.last_delivery_time}` : "Last delivery: —",
      row.last_pickup_time ? `Last pickup: ${row.last_pickup_time}` : "Last pickup: —",
      row.export_generated_text ? `FCC snapshot: ${row.export_generated_text}` : null,
    ].filter(Boolean).join(" · "),
  };
}
