import {
  buildMobileAccessContexts,
  driverContextForCompany,
  type AccessContextResponse,
  type DriverAccessGate,
} from "./access";

const member = (overrides: Record<string, unknown> = {}) => ({
  company_id: "company-1",
  company_name: "Beacon Point Ventures, Inc",
  company_slug: "beacon-point-ventures",
  company_status: "active",
  relationship_type: "member",
  membership_status: "active",
  title: "Fleet manager",
  grants: ["fleet", "schedule"],
  ...overrides,
});

const driverGate: DriverAccessGate = {
  company_id: "company-1",
  company_name: "Beacon Point Ventures, Inc",
  company_slug: "beacon-point-ventures",
  roster_member_id: "roster-1",
  driver_name: "Taylor Driver",
  access_mode: "DRIVER",
};

describe("MC-8A mobile role contexts", () => {
  it("adds a grant-matched manager context before a direct driver context", () => {
    const access: AccessContextResponse = { memberships: [member()] };
    const contexts = buildMobileAccessContexts(access, [driverGate]);

    expect(contexts.map((context) => context.role)).toEqual(["MANAGER", "DRIVER"]);
    expect(contexts[0]).toMatchObject({
      context_key: "manager:company-1",
      grants: ["fleet", "schedule"],
    });
    expect(driverContextForCompany(contexts, "company-1")?.driver_name)
      .toBe("Taylor Driver");
  });

  it("gives company admins the complete manager workspace catalog", () => {
    const contexts = buildMobileAccessContexts({
      memberships: [member({ relationship_type: "admin", grants: [] })],
    }, []);

    expect(contexts).toHaveLength(1);
    expect(contexts[0]).toMatchObject({ role: "MANAGER" });
    expect(contexts[0].role === "MANAGER" && contexts[0].grants).toHaveLength(14);
    expect(contexts[0].role === "MANAGER" && contexts[0].is_platform_owner).toBe(false);
  });

  it("keeps a demo administrator limited to explicit App Review grants", () => {
    const contexts = buildMobileAccessContexts({
      memberships: [member({
        company_id: "company-demo",
        company_name: "Insight Demo",
        company_slug: "insight-demo",
        experience_mode: "DEMO",
        relationship_type: "admin",
        grants: ["schedule", "dispatch", "delivery_window", "reports", "fleet", "routes"],
      })],
    }, []);

    expect(contexts).toHaveLength(1);
    expect(contexts[0]).toMatchObject({
      role: "MANAGER",
      company_id: "company-demo",
      experience_mode: "DEMO",
      grants: ["schedule", "dispatch", "delivery_window", "reports", "fleet", "routes"],
    });
  });

  it("derives platform-owner manager scope from authorized demo companies", () => {
    const contexts = buildMobileAccessContexts({
      is_platform_owner: true,
      memberships: [],
    }, [{ ...driverGate, access_mode: "ADMIN_DEMO" }]);

    expect(contexts[0]).toMatchObject({
      role: "MANAGER",
      company_id: "company-1",
      title: "Platform owner",
      is_platform_owner: true,
    });
    expect(contexts[0].role === "MANAGER" && contexts[0].grants).toHaveLength(14);
  });

  it("retains platform-owner message authority on membership-backed manager contexts", () => {
    const contexts = buildMobileAccessContexts({
      is_platform_owner: true,
      memberships: [member({ relationship_type: "member", grants: [] })],
    }, []);

    expect(contexts[0]).toMatchObject({
      role: "MANAGER",
      relationship_type: "member",
      is_platform_owner: true,
    });
    expect(contexts[0].role === "MANAGER" && contexts[0].grants).toHaveLength(14);
  });

  it("does not expose inactive or ungranted memberships as manager contexts", () => {
    const contexts = buildMobileAccessContexts({
      memberships: [
        member({ membership_status: "inactive" }),
        member({ company_id: "company-2", grants: [] }),
      ],
    }, []);

    expect(contexts).toEqual([]);
  });

  it("keeps admin demo drivers isolated while still exposing admin manager access", () => {
    const demo: DriverAccessGate = {
      ...driverGate,
      access_mode: "ADMIN_DEMO",
    };
    const contexts = buildMobileAccessContexts({
      memberships: [member({ relationship_type: "admin", grants: [] })],
    }, [demo]);

    expect(contexts[1]).toMatchObject({
      role: "DRIVER",
      access_mode: "ADMIN_DEMO",
      context_key: "company-1:roster-1",
    });
  });

  it("keeps one representative admin demo gate per company", () => {
    const contexts = buildMobileAccessContexts({
      memberships: [member({ relationship_type: "admin", grants: [] })],
    }, [
      { ...driverGate, roster_member_id: "roster-1", driver_name: "A Driver", access_mode: "ADMIN_DEMO" },
      { ...driverGate, roster_member_id: "roster-2", driver_name: "B Driver", access_mode: "ADMIN_DEMO" },
    ]);

    expect(contexts.filter((context) => context.role === "DRIVER")).toHaveLength(1);
  });
});
