import { describe, expect, it } from "vitest";
import { buildRequestEyebrowMap } from "./driverCalendar";
import { evaluateDriverTimeOffRequestEligibility } from "./driverTimeOffRequests";

describe("driver blackout dates", () => {
  it("gives blackout guidance priority on the driver calendar", () => {
    const eyebrowMap = buildRequestEyebrowMap(
      [
        {
          id: "request",
          requested_dates: ["2099-11-28"],
          start_date: "2099-11-28",
          end_date: "2099-11-28",
          day_count: 1,
          status: "PENDING",
        },
      ],
      [
        {
          blackout_date: "2099-11-28",
          message: "Contact leadership.",
        },
      ]
    );

    expect(eyebrowMap.get("2099-11-28")).toEqual({
      token: "BLK",
      tone: "blackout",
    });
  });

  it("prevents a range containing a blackout date from being submitted", () => {
    expect(
      evaluateDriverTimeOffRequestEligibility(
        ["2099-11-27", "2099-11-28", "2099-11-29"],
        [
          {
            blackout_date: "2099-11-28",
            message: "Please contact leadership directly.",
          },
        ]
      )
    ).toEqual({
      canSubmit: false,
      reason:
        "2099-11-28 is a blackout date. Please contact leadership directly.",
    });
  });
});
