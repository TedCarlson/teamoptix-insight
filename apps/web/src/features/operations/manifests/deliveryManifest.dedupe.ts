import type {
  DeliveryManifestPackageRow,
  DeliveryManifestStopRow,
} from "./deliveryManifest.parse";

type DedupeResult<T> = {
  rows: T[];
  duplicateCount: number;
  unidentifiedCount: number;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function populatedFieldCount(row: Record<string, unknown>) {
  return Object.values(row).filter((value) => {
    if (value === null || value === undefined) return false;
    if (typeof value === "string") return value.trim().length > 0;
    return true;
  }).length;
}

function stopIdentity(row: DeliveryManifestStopRow) {
  const stop = text(row.st_number);
  const sid = text(row.sid);
  if (sid) return `SID|${sid.toUpperCase()}`;

  const detail = [
    row.address_line_1,
    row.address_line_2,
    row.city,
    row.state,
    row.postal_code,
    row.recipient,
    row.contact_name,
    row.delivery_time_begin,
    row.delivery_time_end,
  ].map((value) => text(value).replace(/\s+/g, " ").toUpperCase());

  if (detail.some(Boolean)) return `DETAIL|${detail.join("|")}`;
  return `STOP|${(stop || "UNKNOWN").toUpperCase()}`;
}

function stopRank(row: DeliveryManifestStopRow) {
  const progressEvidence = [
    row.completed,
    row.delivery_time_begin,
    row.delivery_time_end,
  ].filter((value) => text(value)).length;

  return [
    progressEvidence,
    populatedFieldCount(row as unknown as Record<string, unknown>),
    row.package_count ?? -1,
  ] as const;
}

function packageRank(row: DeliveryManifestPackageRow) {
  return [
    text(row.prem_svc_raw) ? 1 : 0,
    populatedFieldCount(row as unknown as Record<string, unknown>),
  ] as const;
}

function outranks(candidate: readonly number[], current: readonly number[]) {
  for (let index = 0; index < Math.max(candidate.length, current.length); index += 1) {
    const candidateValue = candidate[index] ?? 0;
    const currentValue = current[index] ?? 0;
    if (candidateValue !== currentValue) return candidateValue > currentValue;
  }
  return false;
}

export function dedupeDeliveryManifestStops(
  rows: DeliveryManifestStopRow[]
): DedupeResult<DeliveryManifestStopRow> {
  const output: DeliveryManifestStopRow[] = [];
  const indexByIdentity = new Map<string, number>();
  let duplicateCount = 0;
  let unidentifiedCount = 0;

  for (const row of rows) {
    const identity = stopIdentity(row);
    const existingIndex = indexByIdentity.get(identity);
    if (existingIndex === undefined) {
      indexByIdentity.set(identity, output.length);
      output.push(row);
      continue;
    }

    duplicateCount += 1;
    const existing = output[existingIndex];
    if (outranks(stopRank(row), stopRank(existing))) output[existingIndex] = row;
  }

  return { rows: output, duplicateCount, unidentifiedCount };
}

export function dedupeDeliveryManifestPackages(
  rows: DeliveryManifestPackageRow[]
): DedupeResult<DeliveryManifestPackageRow> {
  const output: DeliveryManifestPackageRow[] = [];
  const indexByTrackingId = new Map<string, number>();
  let duplicateCount = 0;
  let unidentifiedCount = 0;

  for (const row of rows) {
    const trackingId = text(row.tracking_id);
    if (!trackingId) {
      unidentifiedCount += 1;
      output.push({ ...row, tracking_id: "" });
      continue;
    }

    const existingIndex = indexByTrackingId.get(trackingId);
    if (existingIndex === undefined) {
      indexByTrackingId.set(trackingId, output.length);
      output.push({ ...row, tracking_id: trackingId });
      continue;
    }

    duplicateCount += 1;
    const existing = output[existingIndex];
    if (outranks(packageRank(row), packageRank(existing))) {
      output[existingIndex] = { ...row, tracking_id: trackingId };
    }
  }

  return { rows: output, duplicateCount, unidentifiedCount };
}
