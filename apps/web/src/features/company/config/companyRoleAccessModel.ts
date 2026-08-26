import type { CompanyWorkspaceGrantKey } from "./companyAccessModel";

export type WorkforceLeadershipRoleKey =
  | "business_contact"
  | "assistant_bc"
  | "fleet_manager"
  | "hr";

type RoleAccessTemplate = {
  leadershipRoleKey: WorkforceLeadershipRoleKey | null;
  grants: CompanyWorkspaceGrantKey[];
};

const OPERATIONS_LEADERSHIP_GRANTS: CompanyWorkspaceGrantKey[] = [
  "schedule",
  "dispatch",
  "routes",
  "planning",
  "delivery_window",
  "operations_uploads",
  "reports",
  "assets",
];

const ROLE_ACCESS_TEMPLATES: Record<string, RoleAccessTemplate> = {
  "Business Contact": {
    leadershipRoleKey: "business_contact",
    grants: OPERATIONS_LEADERSHIP_GRANTS,
  },
  "Assistant BC": {
    leadershipRoleKey: "assistant_bc",
    grants: OPERATIONS_LEADERSHIP_GRANTS,
  },
  "Fleet Manager": {
    leadershipRoleKey: "fleet_manager",
    grants: ["fleet", "routes"],
  },
  Mechanic: {
    leadershipRoleKey: null,
    grants: ["fleet"],
  },
};

export function getCompanyRoleAccessTemplate(roleLabel: string): RoleAccessTemplate {
  const template = ROLE_ACCESS_TEMPLATES[roleLabel];
  return template
    ? { ...template, grants: [...template.grants] }
    : { leadershipRoleKey: null, grants: [] };
}

export function leadershipLabel(roleKey: WorkforceLeadershipRoleKey | null) {
  switch (roleKey) {
    case "business_contact": return "Business Contact";
    case "assistant_bc": return "Assistant BC";
    case "fleet_manager": return "Fleet Manager";
    case "hr": return "HR";
    default: return "No leadership assignment";
  }
}
