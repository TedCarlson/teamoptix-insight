import { describe, expect, it } from "vitest";
import {
  buildMobileWorkspaceGroups,
  hasMobileWorkspaceAccess,
  mobileWorkspaceGrantKeys,
} from "./mobileWorkspace";

const member = (grants: string[], status = "active") => ({
  memberships: [{
    company_slug: "acme",
    membership_status: status,
    relationship_type: "member",
    grants,
  }],
});

describe("mobile workspace access", () => {
  it("only exposes destinations explicitly granted to a member", () => {
    const groups = buildMobileWorkspaceGroups(member(["schedule", "fleet"]), "acme");

    expect(groups.flatMap((group) => group.destinations.map((item) => item.key)))
      .toEqual(["schedule", "fleet"]);
    expect(groups[0]?.destinations[0]).toMatchObject({
      href: "/company/acme/mobile/schedule",
      readiness: "mobile_bridge",
    });
  });

  it("does not expose grants from another or inactive membership", () => {
    expect(hasMobileWorkspaceAccess(member(["fleet"], "pending"), "acme")).toBe(false);
    expect(hasMobileWorkspaceAccess(member(["fleet"]), "other")).toBe(false);
  });

  it("gives company admins and platform owners the complete catalog", () => {
    const admin = {
      memberships: [{
        company_slug: "acme",
        membership_status: "active",
        relationship_type: "admin",
        grants: [],
      }],
    };

    expect(mobileWorkspaceGrantKeys(admin, "acme")).toHaveLength(15);
    expect(mobileWorkspaceGrantKeys({ is_platform_owner: true, memberships: [] }, "acme"))
      .toHaveLength(15);
  });

  it("ignores unknown grant keys", () => {
    expect(mobileWorkspaceGrantKeys(member(["fleet", "not-a-grant"]), "acme"))
      .toEqual(["fleet"]);
  });
});
