import {
  emptyInspectionDraft,
  fleetInspectionItems,
  inspectionItemsPayload,
  inspectionValidationError,
  scheduleForDate,
  timeOffEligibilityError,
  timeOffRangeDates,
  type DriverSchedule,
} from "./mobile";

describe("MC-2 driver domain", () => {
  it("prefers governed day facts over the recurring baseline", () => {
    const schedule: DriverSchedule = {
      baseline: {
        preset_id: "preset",
        rotation_mode: "NONE",
        anchor_date: "2026-08-01",
        effective_start: "2026-08-01",
        rotation_works_s: false,
        rotation_works_u: false,
        rotation_works_m: false,
        rotation_works_t: false,
        rotation_works_w: false,
        rotation_works_h: false,
        rotation_works_f: false,
        default_route_s: null,
        default_route_u: null,
        default_route_m: "410",
        default_route_t: null,
        default_route_w: null,
        default_route_h: null,
        default_route_f: null,
      },
      preset: {
        works_s: false,
        works_u: false,
        works_m: true,
        works_t: false,
        works_w: false,
        works_h: false,
        works_f: false,
      },
      facts: [
        {
          service_date: "2026-08-10",
          planned_on: false,
          route_name: null,
          source_kind: "APPROVED_OVERRIDE",
        },
      ],
    };

    expect(scheduleForDate(schedule, new Date(2026, 7, 10))).toEqual({
      scheduled: false,
      route: "OFF",
      source: "APPROVED_OVERRIDE",
    });
  });

  it("requires all answers, defect notes, daily photos, and the safety choice", () => {
    const draft = emptyInspectionDraft();
    draft.vehicleId = "vehicle";
    draft.odometer = "12345";
    for (const [, key] of fleetInspectionItems) draft.results[key] = "PASS";

    expect(inspectionValidationError(draft)).toMatch(/required front exterior/i);

    for (const key of [
      "exterior_front",
      "exterior_rear",
      "exterior_driver",
      "exterior_passenger",
    ]) {
      draft.evidence.push({
        itemKey: key,
        base64: "evidence",
        contentType: "image/jpeg",
        sizeBytes: 8,
        sha256: "a".repeat(64),
      });
    }
    expect(inspectionValidationError(draft)).toMatch(/safe to operate/i);

    draft.safeToOperate = true;
    draft.results.parking_brake = "DEFECT";
    expect(inspectionValidationError(draft)).toMatch(/notes for parking brake/i);
    draft.notes.parking_brake = "Does not hold on incline";
    expect(inspectionValidationError(draft)).toBeNull();
    expect(inspectionItemsPayload(draft)).toHaveLength(19);
  });

  it("preserves selected-only dates and expands an explicit range", () => {
    const selected = ["2026-08-28", "2026-08-21", "2026-08-21"];
    expect(timeOffRangeDates(selected)).toEqual([
      "2026-08-21",
      "2026-08-22",
      "2026-08-23",
      "2026-08-24",
      "2026-08-25",
      "2026-08-26",
      "2026-08-27",
      "2026-08-28",
    ]);
  });

  it("enforces the ten-day notice without changing server authority", () => {
    const today = new Date(2026, 7, 11);
    expect(timeOffEligibilityError(["2026-08-20"], today)).toMatch(/10 days/i);
    expect(timeOffEligibilityError(["2026-08-21"], today)).toBeNull();
  });
});
