import type { CompanyWorkspaceGrantKey, ManagerAccessContext } from "./access";
import type { ManagerWalkOnSnapshot } from "./managerWalkOns";
import type { ManagerPeopleSnapshot } from "./managerPeople";
import type { ManagerFleetSnapshot } from "./managerFleet";
import type { ManagerRoutesSnapshot } from "./managerRoutes";

export type ManagerWorkspaceKey = "operations" | "people" | "fleet" | "routes" | "admin" | "messages";

export type ManagerWorkspaceChildKey = "dispatch" | "service" | "planning" | "reports" | "walk_ons";

export type ManagerWorkspaceChild = {
  key?: ManagerWorkspaceChildKey;
  code: string;
  label: string;
  detail: string;
  path: string;
  mobileVisible?: boolean;
  requiredGrant?: CompanyWorkspaceGrantKey;
};

export type ManagerWorkspaceSuite = {
  key: ManagerWorkspaceKey;
  code: string;
  label: string;
  detail: string;
  grants: CompanyWorkspaceGrantKey[];
  children: ManagerWorkspaceChild[];
};

export type ManagerWorkspaceTone = "default" | "success" | "warning" | "danger";

export type ManagerWorkspaceMetric = {
  label: string;
  value: string;
  tone?: ManagerWorkspaceTone;
};

export type ManagerWorkspaceItem = {
  id: string;
  title: string;
  detail: string;
  meta?: string;
  tone?: ManagerWorkspaceTone;
  eyebrow?: string;
  filterKeys?: string[];
  facts?: Array<{ label: string; value: string }>;
  chips?: string[];
};

export type ManagerWorkspaceFilter = {
  key: string;
  label: string;
};

export type ManagerOperationsPhase = "unassigned" | "waiting" | "arrived" | "on_job" | "end_of_day";

export type ManagerOperationsRoute = {
  id: string;
  routeName: string;
  workArea: string | null;
  driverName: string | null;
  phase: ManagerOperationsPhase;
  completedStops: number;
  plannedStops: number;
  completedPackages: number;
  plannedPackages: number;
  completedPickups: number;
  plannedPickups: number;
  expressComplete: number;
  expressAttempted: number;
  expressOpen: number;
  expressTotal: number;
  ilsPercent: number | null;
  progressPercent: number;
};

export type ManagerOperationsSnapshot = {
  serviceDate: string;
  statusText: string;
  terminalCode: string | null;
  timeZone: string;
  routes: ManagerOperationsRoute[];
};

export type ManagerWorkspaceSnapshot = {
  metrics: ManagerWorkspaceMetric[];
  sectionLabel: string;
  items: ManagerWorkspaceItem[];
  emptyMessage: string;
  description?: string;
  filters?: ManagerWorkspaceFilter[];
  statusText?: string;
  serviceDate?: string;
  availableDates?: string[];
  operations?: ManagerOperationsSnapshot;
  people?: ManagerPeopleSnapshot;
  fleet?: ManagerFleetSnapshot;
  routes?: ManagerRoutesSnapshot;
  walkOns?: ManagerWalkOnSnapshot;
};

export const MANAGER_WORKSPACE_SUITES: ManagerWorkspaceSuite[] = [
  {
    key: "operations",
    code: "OP",
    label: "Operations",
    detail: "Operating posture, planning, reports, and walk-ons",
    grants: ["dispatch", "planning", "delivery_window", "reports"],
    children: [
      { key: "dispatch", code: "DP", label: "Dispatch", detail: "Assignments, attendance, route changes, and handoff", path: "/operations/dispatch", requiredGrant: "dispatch" },
      { key: "service", code: "SV", label: "Service", detail: "On-route progress, exceptions, and delivery evidence", path: "/operations/service", requiredGrant: "delivery_window" },
      { key: "planning", code: "PL", label: "Planning", detail: "Forecast, demand, and readiness intelligence", path: "/operations/planning", requiredGrant: "planning" },
      { key: "reports", code: "RP", label: "Ops Reports", detail: "Select a service date and review prior-day facts", path: "/prior-day", requiredGrant: "reports" },
      { key: "walk_ons", code: "WO", label: "Walk Ons", detail: "Support identities, dated assignments, and pay treatment", path: "/operations/walk-ons", requiredGrant: "dispatch" },
      { code: "PU", label: "PU Reconciliation", detail: "Pickup totals, exceptions, and route-level reconciliation", path: "/operations/pu-reconciliation", requiredGrant: "reports" },
    ],
  },
  {
    key: "people",
    code: "PE",
    label: "People",
    detail: "Roster, workforce readiness, hiring, and interviews",
    grants: ["roster", "hiring"],
    children: [
      { code: "RO", label: "Roster", detail: "Active and former team members", path: "/people/roster", requiredGrant: "roster" },
      { code: "WR", label: "Workforce Readiness", detail: "Employment and compliance posture", path: "/people/reports/workforce-readiness", requiredGrant: "roster" },
      { code: "HR", label: "Hiring", detail: "Candidate pipeline and onboarding", path: "/hiring", requiredGrant: "hiring" },
      { code: "IV", label: "Interviews", detail: "Upcoming candidate conversations", path: "/people/interviews", requiredGrant: "hiring" },
      { code: "IN", label: "Invitations", detail: "Activation and invitation delivery status", path: "/people/invitations", requiredGrant: "hiring" },
      { code: "RP", label: "Reports", detail: "Workforce, tenure, readiness, and hiring posture", path: "/people/reports", requiredGrant: "roster" },
      { code: "CA", label: "Corrective Actions", detail: "Open actions, owners, due dates, and resolution", path: "/people/corrective-actions", requiredGrant: "roster" },
      { code: "PO", label: "Policies", detail: "Published policies and acknowledgment posture", path: "/people/policies", requiredGrant: "roster" },
      { code: "CO", label: "Compliance", detail: "Requirements, expirations, and workforce exceptions", path: "/people/compliance", requiredGrant: "roster" },
    ],
  },
  {
    key: "fleet",
    code: "FL",
    label: "Fleet",
    detail: "Vehicles, open defects, inspections, and maintenance",
    grants: ["fleet"],
    children: [
      { code: "HM", label: "Fleet Home", detail: "Availability, defects, inspections, and maintenance posture", path: "/fleet", requiredGrant: "fleet" },
      { code: "VH", label: "Vehicles", detail: "Unit status, assignment, and service history", path: "/fleet/vehicles", requiredGrant: "fleet" },
      { code: "DF", label: "Defects", detail: "Open vehicle issues", path: "/fleet/defects", requiredGrant: "fleet" },
      { code: "IN", label: "Inspections", detail: "Recent inspection outcomes", path: "/fleet/inspections", requiredGrant: "fleet" },
      { code: "WO", label: "Work Orders", detail: "Maintenance in progress", path: "/fleet/work-orders", requiredGrant: "fleet" },
      { code: "AU", label: "Asset Audit", detail: "Assigned assets, custody, and audit exceptions", path: "/fleet/assets", requiredGrant: "fleet" },
    ],
  },
  {
    key: "routes",
    code: "RT",
    label: "Routes",
    detail: "Route directory, run pattern, thresholds, and history",
    grants: ["routes"],
    children: [
      { code: "DR", label: "Directory", detail: "Active route records", path: "/routes", requiredGrant: "routes" },
      { code: "RN", label: "Run Pattern", detail: "Operating days by route", path: "/routes", requiredGrant: "routes" },
      { code: "TH", label: "Thresholds", detail: "Stops and pay thresholds", path: "/routes", requiredGrant: "routes" },
      { code: "HI", label: "History", detail: "Prior route versions", path: "/routes/history", requiredGrant: "routes" },
    ],
  },
  {
    key: "admin",
    code: "AD",
    label: "Admin",
    detail: "Company settings, access, payroll, and opportunity scope",
    grants: ["admin_config", "grant_management", "payroll", "opportunity_analysis"],
    children: [
      { code: "PF", label: "Profile", detail: "Account identity, company context, and security posture", path: "/account" },
      { code: "CO", label: "Company", detail: "Company identity and operating configuration", path: "/config", requiredGrant: "admin_config" },
      { code: "LD", label: "Leadership", detail: "Leadership roster and responsibility mapping", path: "/config/leadership", requiredGrant: "admin_config" },
      { code: "AC", label: "Access", detail: "People, roles, and workspace grants", path: "/config/access", requiredGrant: "grant_management" },
      { code: "OP", label: "Operations Config", detail: "Route order, timekeeping, and terminal preferences", path: "/config/operations", requiredGrant: "admin_config" },
      { code: "AT", label: "Automation", detail: "Operational rules, triggers, and delivery state", path: "/config/automation", requiredGrant: "admin_config" },
      { code: "PS", label: "Payroll Summary", detail: "Pay period activity, timekeeping, and exceptions", path: "/payroll/summary", requiredGrant: "payroll" },
      { code: "PC", label: "Payroll Compliance", detail: "Missing punches, approvals, and compliance posture", path: "/payroll/compliance", requiredGrant: "payroll" },
      { code: "PA", label: "Adjustments", detail: "Pay adjustments, review status, and audit context", path: "/payroll/adjustments", requiredGrant: "payroll" },
      { code: "PR", label: "Productivity", detail: "Labor productivity and route performance", path: "/payroll/productivity", requiredGrant: "payroll" },
      { code: "TT", label: "Time Tracking", detail: "Clock activity, exceptions, and approvals", path: "/payroll/time-tracking", requiredGrant: "payroll" },
      { code: "AN", label: "Analytics", detail: "Operational and workforce trend summaries", path: "/analytics", requiredGrant: "reports" },
      { code: "AS", label: "Assets", detail: "Scanners, fuel cards, custody, and audit posture", path: "/assets", requiredGrant: "admin_config" },
      { code: "OA", label: "Opportunities", detail: "Analyses, comparisons, assumptions, and reference data", path: "/opportunity-analysis", requiredGrant: "opportunity_analysis" },
    ],
  },
  {
    key: "messages",
    code: "MS",
    label: "Messages",
    detail: "Published company updates and acknowledgments",
    grants: [],
    children: [
      { code: "PB", label: "Published", detail: "Live company updates", path: "/announcements" },
      { code: "DR", label: "Drafts", detail: "Messages being prepared", path: "/announcements" },
      { code: "AK", label: "Acknowledgments", detail: "Required-read completion", path: "/announcements" },
    ],
  },
];

export function managerWorkspaceSuites(context: ManagerAccessContext) {
  return MANAGER_WORKSPACE_SUITES.filter(
    (suite) => suite.key !== "messages" && suite.grants.some((grant) => context.grants.includes(grant)),
  ).map((suite) => ({
    ...suite,
    children: suite.children.filter(
      (child) => child.mobileVisible !== false && (!child.requiredGrant || context.grants.includes(child.requiredGrant)),
    ),
  }));
}

export function managerWorkspaceSuite(key: ManagerWorkspaceKey, context?: ManagerAccessContext) {
  const suite = MANAGER_WORKSPACE_SUITES.find((candidate) => candidate.key === key);
  if (!suite) return null;
  if (!context) {
    return {
      ...suite,
      children: suite.children.filter((child) => child.mobileVisible !== false),
    };
  }
  return {
    ...suite,
    children: suite.children.filter(
      (child) => child.mobileVisible !== false && (!child.requiredGrant || context.grants.includes(child.requiredGrant)),
    ),
  };
}
