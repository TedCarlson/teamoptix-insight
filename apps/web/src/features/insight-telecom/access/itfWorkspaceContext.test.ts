import { describe, expect, it } from "vitest";
import {
  buildItfFoundationPreview,
  ITF_WORKSPACE_GRANT,
} from "./itfWorkspaceContext";

const company = {
  id: "company-a",
  company_name: "Company A",
  company_slug: "company-a",
  company_status: "active",
};

describe("ITF foundation preview access", () => {
  it("allows a platform owner without inventing a company entitlement", () => {
    const context = buildItfFoundationPreview(
      { is_platform_owner: true, memberships: [] },
      company
    );

    expect(context).toMatchObject({
      authorization_source: "platform_preview",
      entitlement_status: null,
      can_enter: true,
      can_manage: true,
    });
  });

  it("allows an active company admin and an explicitly granted member", () => {
    const admin = buildItfFoundationPreview(
      {
        memberships: [
          {
            company_slug: "company-a",
            membership_status: "active",
            relationship_type: "admin",
            grants: [],
          },
        ],
      },
      company
    );
    const member = buildItfFoundationPreview(
      {
        memberships: [
          {
            company_slug: "company-a",
            membership_status: "active",
            relationship_type: "member",
            grants: [ITF_WORKSPACE_GRANT],
          },
        ],
      },
      company
    );

    expect(admin?.authorization_source).toBe("company_admin");
    expect(admin?.can_manage).toBe(true);
    expect(member?.authorization_source).toBe("company_grant");
    expect(member?.can_manage).toBe(false);
  });

  it("denies inactive, missing, and cross-company grants", () => {
    expect(
      buildItfFoundationPreview(
        {
          memberships: [
            {
              company_slug: "company-a",
              membership_status: "inactive",
              relationship_type: "admin",
            },
          ],
        },
        company
      )
    ).toBeNull();

    expect(
      buildItfFoundationPreview(
        {
          memberships: [
            {
              company_slug: "company-b",
              membership_status: "active",
              relationship_type: "member",
              grants: [ITF_WORKSPACE_GRANT],
            },
          ],
        },
        company
      )
    ).toBeNull();
  });
});
