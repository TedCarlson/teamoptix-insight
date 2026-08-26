import { describe, expect, it } from "vitest";
import { resolveWorkspaceEntry } from "./workspaceEntry";

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
