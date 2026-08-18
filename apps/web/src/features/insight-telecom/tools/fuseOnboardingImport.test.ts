import { describe, expect, it } from "vitest";
import {
  FUSE_ONBOARDING_HEADERS,
  inspectFuseOnboardingRows,
} from "./fuseOnboardingImport";

const workforceUnits = [
  {
    id: "location-410",
    locationCode: "410",
    locationName: "Keystone",
    divisionId: "division",
    divisionName: "Fulfillment",
    divisionCode: "FUL",
    regionId: "region-410",
    regionName: "Keystone Region",
    regionCode: "410",
  },
  {
    id: "location-427",
    locationCode: "427",
    locationName: "Freedom",
    divisionId: "division",
    divisionName: "Fulfillment",
    divisionCode: "FUL",
    regionId: "region",
    regionName: "Freedom Region",
    regionCode: "427",
  },
];

function sourceRow(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = {
    Date: "08/14/2026",
    "Last Name": "Gogsadze",
    "First Name": "Giorgi",
    "Tech ID": "N/A",
    "Personnel ID": "N/A",
    Office: "427-Comcast-NJ-Freedom Region-FUL",
    "Office Address": "New Jersey- 2727 Fire Rd,Egg Harbor Township,NJ",
    "Company Name": "WIFIRENET INC",
    "Contractor Type": "Contractor Technician",
    Status: "Pending D&B",
    "Note Update": "-",
    "Last Note": "Not Sent",
    "Status Update": "2026-08-16 12:44:57",
    ...overrides,
  };
  return FUSE_ONBOARDING_HEADERS.map((header) => values[header]);
}

describe("FUSE onboarding inspection", () => {
  it("recognizes the governed header signature and preserves onboarding meaning", () => {
    const result = inspectFuseOnboardingRows(
      [Array.from(FUSE_ONBOARDING_HEADERS), sourceRow()],
      { sheetName: "Sheet1", workforceUnits }
    );

    expect(result.recognized).toBe(true);
    if (!result.recognized) return;
    expect(result.rows[0].normalized).toMatchObject({
      fullName: "Giorgi Gogsadze",
      personStatus: "onboarding",
      techId: "",
      fuseEmployeeId: "",
      companyName: "WIFIRENET INC",
      fuseStatus: "Pending D&B",
      sourceAction: "insert_or_update",
      startDate: "2026-08-14",
      locationCode: "427",
      regionalIdentifier: "Comcast-NJ-Freedom Region-FUL",
      positionTitle: "Technician",
    });
    expect(result.counts).toEqual({ total: 1, ready: 1, review: 0, invalid: 0 });
  });

  it("normalizes inconsistent source name casing without changing the raw source", () => {
    const result = inspectFuseOnboardingRows(
      [Array.from(FUSE_ONBOARDING_HEADERS), sourceRow({ "First Name": "cLeAvOn", "Last Name": "MCCANTS JR" })],
      { sheetName: "Sheet1", workforceUnits }
    );

    expect(result.recognized).toBe(true);
    if (!result.recognized) return;
    expect(result.rows[0].normalized.fullName).toBe("Cleavon McCants Jr.");
    expect(result.rows[0].source["First Name"]).toBe("cLeAvOn");
    expect(result.rows[0].source["Last Name"]).toBe("MCCANTS JR");
  });

  it("rejects a workbook that is missing governed FUSE columns", () => {
    const result = inspectFuseOnboardingRows(
      [["First Name", "Last Name", "Status"]],
      { sheetName: "Sheet1", workforceUnits }
    );

    expect(result.recognized).toBe(false);
    if (result.recognized) return;
    expect(result.missingHeaders).toContain("Tech ID");
    expect(result.missingHeaders).toContain("Company Name");
  });

  it("retains same-candidate source rows as status snapshots without treating them as duplicates", () => {
    const result = inspectFuseOnboardingRows(
      [
        Array.from(FUSE_ONBOARDING_HEADERS),
        sourceRow(),
        sourceRow({ Date: "07/17/2026", Status: "Not Hiring" }),
      ],
      { sheetName: "Sheet1", workforceUnits }
    );

    expect(result.recognized).toBe(true);
    if (!result.recognized) return;
    expect(result.rows).toHaveLength(2);
    expect(result.rows.every((row) => row.normalized.sourceSnapshotCount === 2)).toBe(true);
    expect(result.rows.every((row) => row.issues.length === 0)).toBe(true);
  });

  it("disregards Office Address and uses Office for location and regional identity", () => {
    const result = inspectFuseOnboardingRows(
      [
        Array.from(FUSE_ONBOARDING_HEADERS),
        sourceRow({
          Office: "410-Comcast-PA-Keystone Region-FUL",
          "Office Address": "Old Forge-433 Lawrence St.,Old Forge,PA",
        }),
      ],
      { sheetName: "Sheet1", workforceUnits }
    );

    expect(result.recognized).toBe(true);
    if (!result.recognized) return;
    expect(result.rows[0].normalized.locationCode).toBe("410");
    expect(result.rows[0].normalized.regionalIdentifier).toBe("Comcast-PA-Keystone Region-FUL");
    expect(result.rows[0].normalized).not.toHaveProperty("sourceOfficeAddress");
  });

  it("updates an existing candidate but does not create one from an inactive status", () => {
    const result = inspectFuseOnboardingRows(
      [Array.from(FUSE_ONBOARDING_HEADERS), sourceRow({ Status: "Not Qualified" })],
      { sheetName: "Sheet1", workforceUnits }
    );

    expect(result.recognized).toBe(true);
    if (!result.recognized) return;
    expect(result.rows[0].normalized.sourceAction).toBe("update_existing_only");
  });

  it("blocks and ignores an ungoverned status", () => {
    const result = inspectFuseOnboardingRows(
      [Array.from(FUSE_ONBOARDING_HEADERS), sourceRow({ Status: "Surprise Status" })],
      { sheetName: "Sheet1", workforceUnits }
    );

    expect(result.recognized).toBe(true);
    if (!result.recognized) return;
    expect(result.rows[0].normalized.sourceAction).toBe("ignore");
    expect(result.rows[0].issues.some((issue) => issue.code === "unknown_status")).toBe(true);
  });
});
