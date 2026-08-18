import { describe, expect, it } from "vitest";
import {
  ITF_POSITION_TITLE_OPTIONS,
  applyItfStartedPlacement,
  buildItfRosterCommandPayload,
  buildItfRosterCopyText,
  compareItfRosterRowsByTechId,
  createEmptyItfRosterDraft,
  itfAffiliationLabel,
  itfPositionTitleLabel,
  type ItfRosterReviewRow,
} from "./itfRosterForm";

describe("ITF roster form contract", () => {
  it("uses the active donor Position Title vocabulary without free-form drift", () => {
    expect(ITF_POSITION_TITLE_OPTIONS).toEqual([
      "Technician",
      "Drop Bury",
      "BP Supervisor",
      "BP Lead",
      "BP Owner",
      "ITG Supervisor",
      "QA Supervisor",
      "Project Manager",
      "Regional Manager",
      "Director",
      "VP",
      "Admin",
      "Unknown",
    ]);
    expect(createEmptyItfRosterDraft().placement.positionTitle).toBe("Technician");
  });

  it("presents direct and provider workforce language without changing stored donor values", () => {
    expect(itfPositionTitleLabel("BP Supervisor")).toBe("Service Provider Supervisor");
    expect(itfPositionTitleLabel("Technician")).toBe("Technician");
    expect(itfAffiliationLabel("Business Partner")).toBe("Provider workforce");
    expect(itfAffiliationLabel("W-2")).toBe("Direct workforce");
    expect(itfAffiliationLabel("Integrated Tech Group")).toBe("Integrated Tech Group");
  });

  it.each([
    ["training", "TRAINING"],
    ["field", "FIELD"],
    ["travel", "TRAVEL"],
  ] as const)("promotes Started onboarding to Active %s placement", (placement, seatType) => {
    const draft = createEmptyItfRosterDraft();
    draft.person.status = "onboarding";

    const promoted = applyItfStartedPlacement(draft, placement);

    expect(promoted.person.status).toBe("active");
    expect(promoted.placement.positionTitle).toBe("Technician");
    expect(promoted.placement.seatType).toBe(seatType);
    expect(promoted.placement.assignmentStatus).toBe("active");
  });

  it("composes one command from person, identifier, and placement input", () => {
    const draft = createEmptyItfRosterDraft();
    draft.person = {
      fullName: "  Avery Bell  ",
      email: "  AVERY@EXAMPLE.COM ",
      phone: " 555-0100 ",
      status: "onboarding",
    };
    draft.identifiers.tech_id = " I044 ";
    draft.identifiers.nt_login = " ABELL ";
    draft.placement.workforceUnit = "427";
    draft.placement.ownerCompanyId = "company-jcomm";
    draft.placement.locationId = "location-427";
    draft.placement.officeId = "office-427";
    draft.placement.reportsTo = " Location Supervisor ";

    expect(buildItfRosterCommandPayload(draft)).toEqual({
      person: {
        full_name: "Avery Bell",
        email: "avery@example.com",
        phone: "555-0100",
        status: "onboarding",
      },
      identifiers: [
        { identifier_type: "tech_id", identifier_value: "I044" },
        { identifier_type: "nt_login", identifier_value: "ABELL" },
      ],
      workforce_assignment: {
        roster_company_id: "company-jcomm",
        affiliation_type: "W-2",
        engagement_participant_id: null,
        relationship_id: null,
        engagement_location_id: null,
        engagement_office_id: null,
        location_id: "location-427",
        location_code: "427",
        office_id: "office-427",
        position_title: "Technician",
        seat_type: "FIELD",
        assignment_status: "active",
        reports_to: "Location Supervisor",
        effective_from: new Date().toISOString().slice(0, 10),
      },
      entry: { channel: "manual" },
    });
  });

  it("omits blank optional identifiers instead of creating empty records", () => {
    const payload = buildItfRosterCommandPayload(createEmptyItfRosterDraft());

    expect(payload.identifiers).toEqual([]);
    expect(payload.person.email).toBeNull();
    expect(payload.person.phone).toBeNull();
    expect(payload.workforce_assignment.reports_to).toBeNull();
    expect(payload.workforce_assignment.office_id).toBeNull();
    expect(payload.workforce_assignment.location_id).toBeNull();
  });

  it("copies the established Comcast profile fields without creating another record", () => {
    const draft = createEmptyItfRosterDraft();
    draft.person.fullName = "Avery Bell";
    draft.person.phone = "555-0100";
    draft.person.email = "avery@example.com";
    draft.identifiers.tech_id = " i044 ";
    draft.identifiers.nt_login = "ABELL";
    draft.identifiers.csg = "ABELL04";
    draft.placement.reportsTo = "Location Supervisor";

    expect(buildItfRosterCopyText(draft, "Integrated Tech Group")).toBe(
      `Avery Bell • Tech ID: I044
Mobile:      555-0100
NT Login:    ABELL
CSG:         ABELL04
Email:       avery@example.com
Affiliation: Integrated Tech Group
Reports To:  Location Supervisor`
    );
  });

  it("uses the common empty-value mark when leadership has no Tech ID", () => {
    const draft = createEmptyItfRosterDraft();
    draft.person.fullName = "George Koelle";

    expect(buildItfRosterCopyText(draft, "Integrated Tech Group")).toContain(
      "George Koelle • Tech ID: —"
    );
  });

  it("orders roster rows by Tech ID and places missing identifiers last", () => {
    const row = (name: string, techId: string): ItfRosterReviewRow => ({
      ...createEmptyItfRosterDraft(),
      id: name,
      reportsToRosterId: "",
      source: "Company added",
      person: { ...createEmptyItfRosterDraft().person, fullName: name },
      identifiers: { ...createEmptyItfRosterDraft().identifiers, tech_id: techId },
      scope: {
        companyName: "Integrated Tech Group",
        affiliationName: "Integrated Tech Group",
        groupName: "Test team",
        officeName: "Test office",
        divisionName: "Test division",
        regionName: "Test region",
      },
    });

    const rows = [
      row("No Identifier", ""),
      row("Higher Number", "I120"),
      row("Legacy Number", "7296"),
      row("Lower Number", "I044"),
    ].sort(compareItfRosterRowsByTechId);

    expect(rows.map((item) => item.person.fullName)).toEqual([
      "Legacy Number",
      "Lower Number",
      "Higher Number",
      "No Identifier",
    ]);
  });
});
