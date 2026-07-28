import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  DSW_PACKAGE_STATUS_HEADERS,
  parseDswPackageStatusWorkbook,
} from "./packageStatus.parse";

describe("parseDswPackageStatusWorkbook", () => {
  it("reads the package-detail metadata and keeps VSA and STAR distinct", () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      [
        "FedEx - ZSAS: 249/3249 - 20260727",
        "Package Level Detail Table",
        "Generated - 2026-07-27 20:28:23 UTC",
      ],
      [],
      [...DSW_PACKAGE_STATUS_HEADERS],
      [
        "1",
        "BPV 03",
        "0426",
        "309747",
        "BEACON POINT VENTURES INC",
        "426-7512 2026-07-27 01:59:38.0",
        "0874740659370",
        "REDACTED DESTINATION",
        "247092",
        "27",
        "7",
        "07/27/2026 09:03",
      ],
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Package Detail");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xls" });

    const parsed = parseDswPackageStatusWorkbook(buffer);
    expect(parsed.service_date).toBe("2026-07-27");
    expect(parsed.terminal_identity).toBe("ZSAS: 249/3249");
    expect(parsed.generated_at).toBe("2026-07-27T20:28:23Z");
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]).toMatchObject({
      work_area_number: "0426",
      tracking_id: "0874740659370",
      vision_label: "426-7512",
      vision_label_at_local: "2026-07-27T01:59:38",
      vsa_status_code: "27",
      star_status_code: "7",
      star_scan_at_local: "2026-07-27T09:03:00",
    });
  });
});
