export type CompanyWorkspaceGrantKey =
  | "schedule"
  | "dispatch"
  | "routes"
  | "planning"
  | "delivery_window"
  | "operations_uploads"
  | "reports"
  | "roster"
  | "hiring"
  | "payroll"
  | "admin_config"
  | "grant_management"
  | "opportunity_analysis";

export type CompanyWorkspaceGrant = {
  key: CompanyWorkspaceGrantKey;
  label: string;
  group: "Operations" | "Workforce" | "Business";
  description: string;
};

export const COMPANY_WORKSPACE_GRANTS: CompanyWorkspaceGrant[] = [
  { key: "schedule", label: "Schedule", group: "Operations", description: "View schedule and assigned work." },
  { key: "dispatch", label: "Dispatch", group: "Operations", description: "Access Dispatch workspace." },
  { key: "routes", label: "Routes", group: "Operations", description: "Access route records and route setup." },
  { key: "planning", label: "Planning", group: "Operations", description: "Access planning workspace." },
  { key: "delivery_window", label: "Delivery Window", group: "Operations", description: "Access delivery window workspace." },
  { key: "operations_uploads", label: "Operations Uploads", group: "Operations", description: "Upload DSW, DRO, and FCC reports." },
  { key: "reports", label: "Reports", group: "Operations", description: "Access operational reports." },
  { key: "roster", label: "Roster", group: "Workforce", description: "Access workforce roster records." },
  { key: "hiring", label: "Hiring", group: "Workforce", description: "Access hiring workspace." },
  { key: "payroll", label: "Payroll", group: "Business", description: "Access Payroll Aide." },
  { key: "admin_config", label: "Company Config", group: "Business", description: "Access company configuration." },
  { key: "grant_management", label: "Grant Management", group: "Business", description: "Manage workspace access for other users." },
  { key: "opportunity_analysis", label: "Opportunity Analysis", group: "Business", description: "Evaluate prospective contracted service opportunities." },
];
