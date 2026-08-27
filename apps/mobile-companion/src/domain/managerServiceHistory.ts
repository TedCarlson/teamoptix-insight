const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function resolveManagerServiceDate(
  requestedDate: string | undefined,
  maximumServiceDate: string,
) {
  return requestedDate && ISO_DATE.test(requestedDate) && requestedDate <= maximumServiceDate
    ? requestedDate
    : maximumServiceDate;
}

export function hasManagerHistoricalFccEvidence(row: {
  last_delivery_time?: string | null;
  last_pickup_time?: string | null;
  last_transmission_time?: string | null;
  deliveries_complete?: boolean | null;
  pickup_complete?: boolean | null;
  final_stop_time?: string | null;
} | null | undefined) {
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
