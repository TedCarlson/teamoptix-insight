const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type ManagerHistoricalFccEvidence = {
  last_delivery_time?: string | null;
  last_pickup_time?: string | null;
  last_transmission_time?: string | null;
  deliveries_complete?: boolean | null;
  pickup_complete?: boolean | null;
  final_stop_time?: string | null;
};

export function resolveManagerServiceDate(
  requestedDate: string | undefined,
  maximumServiceDate: string,
) {
  return requestedDate && ISO_DATE.test(requestedDate) && requestedDate <= maximumServiceDate
    ? requestedDate
    : maximumServiceDate;
}

export function managerServiceRouteIdentity(value: string | null | undefined) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^wa\s*/i, "")
    .replace(/[^a-z0-9]/g, "");

  if (!normalized) return "";
  if (!/^\d+$/.test(normalized)) return normalized;
  return normalized.replace(/^0+/, "") || "0";
}

export function hasManagerHistoricalFccEvidence(
  row: ManagerHistoricalFccEvidence | null | undefined,
) {
  if (!row) return false;
  return Boolean(
    String(row.last_delivery_time ?? "").trim()
    || String(row.last_pickup_time ?? "").trim()
    || String(row.last_transmission_time ?? "").trim()
    || row.deliveries_complete
    || row.pickup_complete
    || String(row.final_stop_time ?? "").trim(),
  );
}

export function managerHistoricalFccPhase(
  row: ManagerHistoricalFccEvidence | null | undefined,
) {
  if (!hasManagerHistoricalFccEvidence(row)) return null;
  if (
    String(row?.final_stop_time ?? "").trim()
    || (row?.deliveries_complete === true && row?.pickup_complete !== false)
  ) {
    return "end_of_day" as const;
  }
  return "on_job" as const;
}
