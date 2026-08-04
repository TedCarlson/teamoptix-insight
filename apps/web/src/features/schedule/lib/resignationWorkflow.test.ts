import { describe, expect, it } from "vitest";
import {
  addIsoDays,
  buildResignationCompletionEmail,
  resignationImpactWindow,
  type ResignationNotificationPayload,
} from "./resignationWorkflow";

const payload: ResignationNotificationPayload = {
  workflow_id: "workflow-1",
  company_slug: "example",
  company_name: "Example Co",
  employee_name: "Driver <One>",
  notice_date: "2026-08-04",
  last_scheduled_date: "2026-08-18",
  separation_date: "2026-08-19",
  recipients: ["ao@example.com", "contact@example.com"],
  repaint_evidence: { generated_count: 15, override_count: 0 },
  assets: [
    {
      case_id: "case-1",
      asset_identifier: "SCAN-100",
      asset_type_label: "Scanner",
      recovery_status: "RECOVERY_PENDING",
      release_trigger_status: "SENT",
    },
  ],
};

describe("resignation workflow dates", () => {
  it("calculates LD+1 across month and leap-year boundaries", () => {
    expect(addIsoDays("2028-02-29", 1)).toBe("2028-03-01");
    expect(addIsoDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("previews schedule removal beginning LD+1", () => {
    expect(resignationImpactWindow("2026-08-18")).toEqual({
      startDate: "2026-08-19",
      endDate: "2026-09-01",
    });
  });

  it("rejects invalid dates", () => {
    expect(() => addIsoDays("2026-02-30", 1)).toThrow("Date must be valid");
  });
});

describe("resignation completion evidence", () => {
  it("reports the completed roster workflow and non-blocking asset case", () => {
    const message = buildResignationCompletionEmail(
      payload,
      "https://insight.example/company/example/schedule/overrides#workflow-1"
    );

    expect(message.subject).toBe(
      "Resignation workflow completed — Driver <One>"
    );
    expect(message.html).toContain("The scheduled separation workflow is complete.");
    expect(message.html).toContain("Asset recovery is non-blocking");
    expect(message.html).toContain("SCAN-100");
    expect(message.html).toContain("case-1");
    expect(message.html).toContain("Open the workflow audit record");
    expect(message.html).toContain("Driver &lt;One&gt;");
    expect(message.html).not.toContain("<h1 style=\"margin:0 0 8px\">Driver <One>");
  });

  it("does not imply an asset case is required when no asset was assigned", () => {
    const message = buildResignationCompletionEmail({ ...payload, assets: [] });
    expect(message.html).toContain("No assigned assets required a release trigger.");
  });
});
