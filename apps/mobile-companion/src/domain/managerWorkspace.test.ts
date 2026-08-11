import type { ManagerAccessContext } from "./access";
import { managerWorkspaceSuite, managerWorkspaceSuites } from "./managerWorkspace";

const context: ManagerAccessContext = {
  role: "MANAGER",
  company_id: "company-1",
  company_name: "Beacon Point Ventures",
  company_slug: "beacon-point-ventures",
  context_key: "manager:company-1",
  relationship_type: "member",
  title: "Fleet Manager",
  grants: ["fleet", "routes", "roster"],
};

describe("manager workspace suites", () => {
  it("shows only grant-backed parent workspaces", () => {
    expect(managerWorkspaceSuites(context).map((suite) => suite.key)).toEqual([
      "people",
      "fleet",
      "routes",
    ]);
  });

  it("filters children using the same access grants", () => {
    const people = managerWorkspaceSuites(context).find((suite) => suite.key === "people");
    expect(people?.children.map((child) => child.label)).toEqual(["Roster", "Workforce Readiness"]);
    expect(managerWorkspaceSuite("messages")?.children).toHaveLength(3);
  });
});
