import { easternOperationalDayBounds } from "@/lib/operationalDay";

export const MANIFEST_DETAIL_RETENTION_DAYS = 7;
export const MANIFEST_EVIDENCE_RETENTION_DAYS = 366;

export type FccManifestSummaryRow = {
  source_route_key?: string | null;
  source_wa_number?: string | null;
  source_driver_name?: string | null;
  normalized_row_json?: Record<string, unknown> | null;
};

export function addIsoDays(dateIso: string, days: number) {
  const date = new Date(`${dateIso}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function manifestHistoryWindow(now = new Date()) {
  const maximum = easternOperationalDayBounds(now).operationalDate;
  return {
    minimum: addIsoDays(maximum, -MANIFEST_EVIDENCE_RETENTION_DAYS),
    maximum,
    detail_minimum: addIsoDays(maximum, -MANIFEST_DETAIL_RETENTION_DAYS),
  };
}

export function isManifestDetailDate(value: string, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const { detail_minimum: minimum, maximum } = manifestHistoryWindow(now);
  return value >= minimum && value <= maximum;
}

export function isManifestHistoryDate(value: string, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const { minimum, maximum } = manifestHistoryWindow(now);
  return value >= minimum && value <= maximum;
}

export function normalizeManifestRouteKey(value: unknown) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/^WA\s*#?\s*/i, "")
    .replace(/^0+(?=\d)/, "")
    .replace(/[^A-Z0-9]/g, "");
}

export function fccRouteKeys(row: FccManifestSummaryRow) {
  const normalized = row.normalized_row_json ?? {};
  return new Set(
    [
      row.source_route_key,
      row.source_wa_number,
      normalized.wa_number,
      normalized.wa_number_normalized,
      normalized.route_key,
      normalized.route_label,
    ]
      .map(normalizeManifestRouteKey)
      .filter(Boolean)
  );
}

export function fccRouteIdentity(row: FccManifestSummaryRow) {
  const normalized = row.normalized_row_json ?? {};
  const routeKey = [
    normalized.wa_number_normalized,
    normalized.wa_number,
    row.source_wa_number,
    normalized.route_key,
    row.source_route_key,
    normalized.route_label,
  ]
    .map(normalizeManifestRouteKey)
    .find(Boolean);

  if (!routeKey) return null;

  const sourceLabel = [
    normalized.route_label,
    normalized.wa_number,
    row.source_wa_number,
    row.source_route_key,
  ]
    .map((value) => String(value ?? "").trim())
    .find(Boolean);
  const routeLabel = sourceLabel && /^WA\s/i.test(sourceLabel)
    ? sourceLabel
    : `WA ${routeKey}`;

  return { routeKey, routeLabel };
}

export function fccSummarySignalCount(row: FccManifestSummaryRow) {
  const normalized = row.normalized_row_json ?? {};
  return [
    normalized.last_delivery_time,
    normalized.last_delivery_address,
    normalized.last_pickup_time,
    normalized.last_transmission_time,
    normalized.final_stop_time,
  ].filter((value) => String(value ?? "").trim()).length;
}

function localTimeSeconds(value: unknown) {
  const match = String(value ?? "").trim().match(
    /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/
  );
  if (!match) return -1;
  return (
    Number(match[1]) * 3600 +
    Number(match[2]) * 60 +
    Number(match[3] ?? 0)
  );
}

export function preferFccRouteSummary(
  candidate: FccManifestSummaryRow,
  current: FccManifestSummaryRow
) {
  const candidateDelivery = localTimeSeconds(
    candidate.normalized_row_json?.last_delivery_time
  );
  const currentDelivery = localTimeSeconds(
    current.normalized_row_json?.last_delivery_time
  );
  if (candidateDelivery !== currentDelivery) {
    return candidateDelivery > currentDelivery;
  }
  return fccSummarySignalCount(candidate) > fccSummarySignalCount(current);
}

export function findFccRouteSummary(
  rows: FccManifestSummaryRow[],
  routeKey: string,
  routeLabel?: string | null
) {
  const candidates = [routeKey, routeLabel]
    .map(normalizeManifestRouteKey)
    .filter(Boolean);
  return (
    rows.find((row) => {
      const keys = fccRouteKeys(row);
      return candidates.some((candidate) => keys.has(candidate));
    }) ?? null
  );
}

export function fccSummaryFields(row: FccManifestSummaryRow | null) {
  const normalized = row?.normalized_row_json ?? {};
  const value = (key: string) => {
    const raw = normalized[key];
    return raw === null || raw === undefined || String(raw).trim() === ""
      ? null
      : String(raw).trim();
  };

  return {
    driver_name:
      value("driver_name") ??
      (row?.source_driver_name ? String(row.source_driver_name).trim() : null),
    last_delivery_time: value("last_delivery_time"),
    last_delivery_address: value("last_delivery_address"),
    last_pickup_time: value("last_pickup_time"),
    last_transmission_time: value("last_transmission_time"),
    final_stop_time: value("final_stop_time"),
    deliveries_complete: normalized.deliveries_complete === true,
  };
}
