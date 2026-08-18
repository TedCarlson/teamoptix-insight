import { describe, expect, it } from "vitest";
import { COMPANY_WORKSPACE_GRANTS } from "./companyAccessModel";
import { canAccessCompanyWorkspace } from "./companyWorkspaceAccess";

describe("Fleet workspace access", () => {
  it("publishes Fleet as a workspace grant without making inspections a grant", () => {
    const grantKeys: string[] = COMPANY_WORKSPACE_GRANTS.map((grant) => grant.key);
    expect(grantKeys).toContain("fleet");
    expect(grantKeys).not.toContain("inspections");
  });

  it("allows platform owners, active company admins, and active Fleet grantees", () => {
    expect(canAccessCompanyWorkspace({ is_platform_owner: true }, "acme", "fleet")).toBe(true);
    expect(canAccessCompanyWorkspace({ memberships: [{ company_slug: "acme", membership_status: "active", relationship_type: "admin", grants: [] }] }, "acme", "fleet")).toBe(true);
    expect(canAccessCompanyWorkspace({ memberships: [{ company_slug: "acme", membership_status: "active", relationship_type: "member", grants: ["fleet"] }] }, "acme", "fleet")).toBe(true);
  });

  it("denies missing, cross-company, and inactive Fleet grants", () => {
    expect(canAccessCompanyWorkspace({ memberships: [{ company_slug: "acme", membership_status: "active", relationship_type: "member", grants: [] }] }, "acme", "fleet")).toBe(false);
    expect(canAccessCompanyWorkspace({ memberships: [{ company_slug: "other", membership_status: "active", relationship_type: "member", grants: ["fleet"] }] }, "acme", "fleet")).toBe(false);
    expect(canAccessCompanyWorkspace({ memberships: [{ company_slug: "acme", membership_status: "pending", relationship_type: "member", grants: ["fleet"] }] }, "acme", "fleet")).toBe(false);
  });
});

describe("ITF workspace grant", () => {
  it("publishes one company-scoped product entry grant", () => {
    const grantKeys: string[] = COMPANY_WORKSPACE_GRANTS.map((grant) => grant.key);

    expect(grantKeys).toContain("insight_telecom_fulfillment");
    expect(
      canAccessCompanyWorkspace(
        {
          memberships: [
            {
              company_slug: "acme",
              membership_status: "active",
              relationship_type: "member",
              grants: ["insight_telecom_fulfillment"],
            },
          ],
        },
        "acme",
        "insight_telecom_fulfillment"
      )
    ).toBe(true);
  });
});
