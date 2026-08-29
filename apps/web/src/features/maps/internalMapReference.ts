export const maximumMapArchiveRangeBytes = 8 * 1024 * 1024;

export type InternalMapReferencePack = {
  pack_key: string;
  coverage_key: string;
  source_snapshot: string;
  schema_version: string;
  storage_key: string;
  byte_length: number;
  sha256: string;
  min_zoom: number;
  max_zoom: number;
  west: number;
  south: number;
  east: number;
  north: number;
  attribution_html: string;
};

export type InternalMapReferenceDescriptor = Omit<InternalMapReferencePack, "storage_key"> & {
  archive_url: string;
  bounds: [number, number, number, number];
};

export function internalMapReferenceDescriptor(value: unknown): InternalMapReferenceDescriptor | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const bounds = Array.isArray(source.bounds) ? source.bounds.map(Number) : [];
  const pack = internalMapReferencePack([{ ...source, storage_key: "descriptor.pmtiles" }]);
  const archiveUrl = String(source.archive_url ?? "");
  if (!pack || bounds.length !== 4 || !bounds.every(Number.isFinite)) return null;
  if (!archiveUrl.startsWith("/api/company/") || !archiveUrl.endsWith(".pmtiles")) return null;
  const { storage_key: _storageKey, ...publicPack } = pack;
  return { ...publicPack, archive_url: archiveUrl, bounds: bounds as [number, number, number, number] };
}

export function internalMapReferencePack(value: unknown): InternalMapReferencePack | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return null;
  const source = row as Record<string, unknown>;
  const pack = {
    pack_key: String(source.pack_key ?? ""),
    coverage_key: String(source.coverage_key ?? ""),
    source_snapshot: String(source.source_snapshot ?? ""),
    schema_version: String(source.schema_version ?? ""),
    storage_key: String(source.storage_key ?? ""),
    byte_length: Number(source.byte_length),
    sha256: String(source.sha256 ?? ""),
    min_zoom: Number(source.min_zoom),
    max_zoom: Number(source.max_zoom),
    west: Number(source.west),
    south: Number(source.south),
    east: Number(source.east),
    north: Number(source.north),
    attribution_html: String(source.attribution_html ?? ""),
  };
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(pack.pack_key)) return null;
  if (!pack.storage_key.endsWith(".pmtiles") || pack.storage_key.includes("..")) return null;
  if (!Number.isSafeInteger(pack.byte_length) || pack.byte_length <= 0) return null;
  if (!/^[0-9a-f]{64}$/.test(pack.sha256)) return null;
  if (!Number.isInteger(pack.min_zoom) || !Number.isInteger(pack.max_zoom)) return null;
  if (![pack.west, pack.south, pack.east, pack.north].every(Number.isFinite)) return null;
  return pack;
}

export function mapArchiveRange(rangeHeader: string | null, totalLength: number) {
  if (!rangeHeader || !Number.isSafeInteger(totalLength) || totalLength <= 0) return null;
  const match = rangeHeader.trim().match(/^bytes=(\d*)-(\d*)$/i);
  if (!match || (!match[1] && !match[2])) return null;

  let start: number;
  let end: number;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(0, totalLength - suffixLength);
    end = totalLength - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : totalLength - 1;
  }

  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return null;
  if (start < 0 || start >= totalLength || end < start) return null;
  end = Math.min(end, totalLength - 1);
  const length = end - start + 1;
  if (length > maximumMapArchiveRangeBytes) return null;
  return { start, end, length };
}
