import { describe, expect, it } from "vitest";
import {
  internalMapReferenceDescriptor,
  internalMapReferencePack,
  mapArchiveRange,
  maximumMapArchiveRangeBytes,
} from "./internalMapReference";

const row = {
  pack_key: "sc-ga-20260828-z14",
  coverage_key: "US-SC-GA",
  source_snapshot: "2026-08-28",
  schema_version: "4.15.2",
  storage_key: "internal-map-reference/sc-ga/20260828/sc-ga-20260828-z14.pmtiles",
  byte_length: 458398690,
  sha256: "20bd174bbfc3d89b50c989c4f778a9e6121c42ccc412d73e3959a4fe843a6d7f",
  min_zoom: 0,
  max_zoom: 14,
  west: -85.7,
  south: 30.3,
  east: -78.4,
  north: 35.3,
  attribution_html: "OpenStreetMap contributors",
};

describe("internal regional map reference contract", () => {
  it("normalizes a table-returning RPC row", () => {
    expect(internalMapReferencePack([row])).toMatchObject(row);
  });

  it("rejects unsafe storage metadata", () => {
    expect(internalMapReferencePack([{ ...row, storage_key: "../secret.pmtiles" }])).toBeNull();
    expect(internalMapReferencePack([{ ...row, sha256: "not-a-checksum" }])).toBeNull();
  });

  it("accepts only same-origin map-contract archive paths", () => {
    const descriptor = {
      ...row,
      archive_url: "/api/company/beacon-point-ventures/maps/reference/sc-ga-20260828-z14.pmtiles",
      bounds: [row.west, row.south, row.east, row.north],
    };
    expect(internalMapReferenceDescriptor(descriptor)?.archive_url).toBe(descriptor.archive_url);
    expect(internalMapReferenceDescriptor({ ...descriptor, archive_url: "https://tiles.example/map.pmtiles" })).toBeNull();
  });

  it("accepts bounded explicit and suffix ranges", () => {
    expect(mapArchiveRange("bytes=0-126", row.byte_length)).toEqual({ start: 0, end: 126, length: 127 });
    expect(mapArchiveRange("bytes=-16", 100)).toEqual({ start: 84, end: 99, length: 16 });
  });

  it("rejects unbounded, multiple, and oversized archive reads", () => {
    expect(mapArchiveRange(null, row.byte_length)).toBeNull();
    expect(mapArchiveRange("bytes=0-1,4-5", row.byte_length)).toBeNull();
    expect(mapArchiveRange(`bytes=0-${maximumMapArchiveRangeBytes}`, row.byte_length)).toBeNull();
  });
});
