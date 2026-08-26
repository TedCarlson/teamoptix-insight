function displayValue(value: unknown) {
  return value === null || value === undefined || value === ""
    ? "—"
    : String(value);
}

export function manifestDeliveryStopTitle(
  row: Record<string, unknown>,
  identityVerified: boolean
) {
  const stop = `Stop ${displayValue(row.st_number)}`;
  return identityVerified
    ? `${stop} · ${displayValue(row.recipient)}`
    : stop;
}

export function manifestPickupStopTitle(
  row: Record<string, unknown>,
  identityVerified: boolean
) {
  const stop = `Pickup stop ${displayValue(row.pickup_list)}`;
  return identityVerified
    ? `${stop} · ${displayValue(row.shipper_name)}`
    : stop;
}
