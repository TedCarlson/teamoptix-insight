import { describe, expect, it } from "vitest";
import { activePendingMemberships, pendingInviteHref } from "./pendingInvite";

describe("pending invite recovery", () => {
  it("keeps only pending memberships for active companies", () => {
    expect(
      activePendingMemberships([
        { company_id: "pending", company_status: "active", membership_status: "pending" },
        { company_id: "active", company_status: "active", membership_status: "active" },
        { company_id: "closed", company_status: "inactive", membership_status: "pending" },
      ])
    ).toEqual([
      { company_id: "pending", company_status: "active", membership_status: "pending" },
    ]);
  });

  it("uses the secret token for a new resume link and an existing session when available", () => {
    expect(pendingInviteHref("secret-token-value")).toBe(
      "/onboarding/invite/secret-token-value"
    );
    expect(pendingInviteHref("secret-token-value", "session-id")).toBe(
      "/onboarding/start/session-id"
    );
  });
});
