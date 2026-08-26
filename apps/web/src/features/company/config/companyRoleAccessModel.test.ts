import { describe, expect, it } from "vitest";
import { getCompanyRoleAccessTemplate } from "./companyRoleAccessModel";

describe("company role access templates", () => {
  it("provisions Assistant BC leadership and operations access together", () => {
    expect(getCompanyRoleAccessTemplate("Assistant BC")).toEqual({
      leadershipRoleKey: "assistant_bc",
      grants: [
        "schedule",
        "dispatch",
        "routes",
        "planning",
        "delivery_window",
        "operations_uploads",
        "reports",
      ],
    });
  });

  it("keeps a driver on the basic experience", () => {
    expect(getCompanyRoleAccessTemplate("Driver")).toEqual({
      leadershipRoleKey: null,
      grants: [],
    });
  });

  it("does not include cross-product grants", () => {
    expect(getCompanyRoleAccessTemplate("Assistant BC").grants as string[]).not.toContain(
      "insight_telecom_fulfillment",
    );
  });
});
