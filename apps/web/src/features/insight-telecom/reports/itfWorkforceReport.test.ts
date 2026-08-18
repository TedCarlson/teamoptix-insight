import { describe, expect, it } from "vitest";
import type { ItfRosterReviewRow } from "../roster/itfRosterForm";
import {
  DEFAULT_ITF_WORKFORCE_REPORT_FILTERS,
  buildItfWorkforceReportCsv,
  filterItfWorkforceReportRows,
  groupItfWorkforceReportRows,
  summarizeItfWorkforceReportRows,
} from "./itfWorkforceReport";

function row(overrides: Partial<ItfRosterReviewRow> = {}): ItfRosterReviewRow {
  return {
    id: "row-1",
    person: { fullName: "Taylor One", email: "", phone: "", status: "active" },
    identifiers: { tech_id: "I044", fuse_emp_id: "", nt_login: "", csg: "" },
    placement: {
      ownerCompanyId: "company-1",
      affiliationType: "W-2",
      engagementParticipantId: "",
      relationshipId: "",
      relationshipName: "Direct company workforce",
      relationshipStatus: "active",
      engagementLocationId: "",
      engagementOfficeId: "",
      locationId: "location-410",
      workforceUnit: "410",
      officeId: "office-1",
      positionTitle: "Technician",
      seatType: "FIELD",
      assignmentStatus: "active",
      reportsTo: "Supervisor One",
      effectiveFrom: "2026-08-01",
    },
    reportsToRosterId: "leader-1",
    source: "ITG sourced",
    scope: {
      companyName: "Integrated Tech Group",
      affiliationName: "W-2",
      groupName: "Supervisor One",
      officeName: "Egg Harbor",
      divisionName: "Northeast",
      regionName: "Tri-State",
    },
    ...overrides,
  };
}

describe("ITF workforce report", () => {
  it("defaults to active workforce and searches established identifiers", () => {
    const inactive = row({
      id: "row-2",
      person: { fullName: "Former Worker", email: "", phone: "", status: "inactive" },
    });
    const rows = [row(), inactive];

    expect(filterItfWorkforceReportRows(rows, DEFAULT_ITF_WORKFORCE_REPORT_FILTERS)).toHaveLength(1);
    expect(filterItfWorkforceReportRows(rows, {
      ...DEFAULT_ITF_WORKFORCE_REPORT_FILTERS,
      search: "i044",
    })).toHaveLength(1);
  });

  it("groups the authorized projection without changing row ownership", () => {
    const provider = row({
      id: "row-2",
      scope: {
        companyName: "JComm",
        affiliationName: "Business Partner",
        groupName: "Provider Supervisor",
        officeName: "Edison",
        divisionName: "Northeast",
        regionName: "Tri-State",
      },
    });

    expect(groupItfWorkforceReportRows([provider, row()], "company").map((group) => group.label)).toEqual([
      "Integrated Tech Group",
      "JComm",
    ]);
  });

  it("summarizes seat counts and exports donor-authentic workforce fields", () => {
    const leadership = row({
      id: "row-2",
      placement: { ...row().placement, positionTitle: "ITG Supervisor", seatType: "LEADERSHIP" },
    });
    const summary = summarizeItfWorkforceReportRows([row(), leadership]);
    const csv = buildItfWorkforceReportCsv([row(), leadership]);

    expect(summary).toMatchObject({ total: 2, FIELD: 1, LEADERSHIP: 1 });
    expect(csv).toContain('"Company","Person","Tech ID","Position","Seat","Location","Office","Reports To","Status"');
    expect(csv).toContain('"I044"');
  });
});
