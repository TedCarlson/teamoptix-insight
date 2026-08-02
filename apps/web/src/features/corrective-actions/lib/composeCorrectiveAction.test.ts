import { describe, expect, it } from "vitest";
import { renderCanStatement, splitStopReferences } from "./composeCorrectiveAction";

describe("CAN statement composition", () => {
  it("renders company, employee, and date tokens deterministically", () => {
    expect(renderCanStatement("{{employee_name}} at {{company_name}} on {{incident_date}}", {
      employeeName: "Alex Driver", companyName: "Beacon Point", incidentDate: "2026-08-02",
    })).toBe("Alex Driver at Beacon Point on 2026-08-02");
  });

  it("normalizes comma and line separated stop references", () => {
    expect(splitStopReferences("12, 18\n22")).toEqual(["12", "18", "22"]);
  });
});
