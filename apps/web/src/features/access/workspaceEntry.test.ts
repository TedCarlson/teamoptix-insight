import { describe, expect, it } from "vitest";
import {
  resolveCompanyRootDestination,
  resolveWorkspaceEntry,
} from "./workspaceEntry";

describe("workspace entry", () => {
  it("sends a basic driver to the driver experience", () => {
    expect(resolveWorkspaceEntry({ memberships: [{ company_slug: "acme", membership_status: "active", relationship_type: "member", grants: [] }] }))
      .toBe("/company/acme/home");
  });

  it("sends a provisioned leader to the tailored company workspace", () => {
    expect(resolveWorkspaceEntry({ memberships: [{ company_slug: "acme", membership_status: "active", relationship_type: "member", grants: ["dispatch", "routes"] }] }))
      .toBe("/company/acme/workspace");
  });

  it("does not treat a cross-product grant as general Insight access", () => {
    expect(resolveWorkspaceEntry({ memberships: [{ company_slug: "acme", membership_status: "active", relationship_type: "member", grants: ["insight_telecom_fulfillment"] }] }))
      .toBe("/company/acme/home");
  });

  it("uses the company chooser when more than one company is active", () => {
    expect(resolveWorkspaceEntry({ memberships: [
      { company_slug: "acme", membership_status: "active" },
      { company_slug: "beta", membership_status: "active" },
    ] })).toBe("/companies");
  });
});

describe("company root destination", () => {
  it("keeps company admins on the Admin overview route", () => {
    expect(resolveCompanyRootDestination({ memberships: [{ company_slug: "acme", membership_status: "active", relationship_type: "admin", grants: [] }] }, "acme"))
      .toBeNull();
  });

  it("keeps platform owners on the Admin overview route", () => {
    expect(resolveCompanyRootDestination({ is_platform_owner: true, memberships: [] }, "acme"))
      .toBeNull();
  });

  it("sends a grant-scoped member to the tailored workspace", () => {
    expect(resolveCompanyRootDestination({ memberships: [{ company_slug: "acme", membership_status: "active", relationship_type: "member", grants: ["reports"] }] }, "acme"))
      .toBe("/company/acme/workspace");
  });

  it("sends a basic member to the driver experience", () => {
    expect(resolveCompanyRootDestination({ memberships: [{ company_slug: "acme", membership_status: "active", relationship_type: "member", grants: [] }] }, "acme"))
      .toBe("/company/acme/home");
  });
});
