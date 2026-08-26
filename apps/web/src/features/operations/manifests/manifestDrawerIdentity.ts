function displayValue(value: unknown) {
  return value === null || value === undefined || value === ""
    ? "—"
    : String(value);
}

export function manifestDeliveryStopTitle(row: Record<string, unknown>) {
  return `Stop ${displayValue(row.st_number)}`;
}

export function manifestPickupStopTitle(row: Record<string, unknown>) {
  return `Pickup stop ${displayValue(row.pickup_list)}`;
}
