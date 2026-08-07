import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  detectDroPackageDetailWorkbook,
  normalizeDroRow,
  parseDroRows,
} from "./dro.parser";

describe("DRO Package Detail parser", () => {
  it("recognizes the RouteSmart AM CSV contract used by manual and automated ingestion", () => {
    const csv = [
      '"SERVICE AREA","WA NAME","WA #","ROUTE TYPE","CAPACITY","TIME","DISTANCE","TOTAL STOPS","TIME CRITICAL","MISSED TIME CRT.","Delivery - STOPS","Delivery - PKGS.","Delivery - CUBE","Pickup - STOPS","Combo - STOPS","Combo - PKGS.","Combo - CUBE","Unrouteable - STOPS"',
      '"309747","BPV 02","0477","REG","184 / 250","7.22","138.05","83","14","0","79","132","183.51","4","0","0","0","0"',
    ].join("\n");
    const workbook = XLSX.read(Buffer.from(csv), { type: "buffer" });

    const detected = detectDroPackageDetailWorkbook(workbook);

    expect(detected).toMatchObject({ frame: "AM", headerIndex: 0 });
    const parsed = parseDroRows(
      detected?.rows ?? [],
      detected?.headerIndex ?? -1
    );
    expect(parsed).toHaveLength(1);
    expect(normalizeDroRow(parsed[0].raw, "AM")).toMatchObject({
      wa_name: "BPV 02",
      wa_number: "477",
      distance: 138.05,
      planned_time: 7.22,
      time_commits: 14,
      lp_stops: 83,
      lp_packages: 132,
    });
  });
});
