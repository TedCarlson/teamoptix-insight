import type { CompanyWorkspaceGrantKey, ManagerAccessContext } from "./access";

export type ManagerWorkspaceKey = "operations" | "people" | "fleet" | "routes" | "admin" | "messages";

export type ManagerWorkspaceChildKey = "dispatch" | "service" | "planning" | "reports" | "walk_ons";

export type ManagerWorkspaceChild = {
  key?: ManagerWorkspaceChildKey;
  code: string;
  label: string;
  detail: string;
  path: string;
  requiredGrant?: CompanyWorkspaceGrantKey;
};

export type ManagerWorkspaceSuite = {
  key: ManagerWorkspaceKey;
  code: string;
  label: string;
  detail: string;
  grants: CompanyWorkspaceGrantKey[];
  fallbackPath: string;
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
  operations?: ManagerOperationsSnapshot;
};

export const MANAGER_WORKSPACE_SUITES: ManagerWorkspaceSuite[] = [
  {
    key: "operations",
    code: "OP",
    label: "Operations",
    detail: "Operating posture, dispatch, service, planning, reports, and walk-ons",
    grants: ["dispatch", "planning", "delivery_window", "reports"],
    fallbackPath: "/operations",
    children: [
      { key: "dispatch", code: "DP", label: "Dispatch", detail: "Assignments, attendance, route changes, and handoff", path: "/operations/dispatch", requiredGrant: "dispatch" },
      { key: "service", code: "SV", label: "Service", detail: "On-route progress, exceptions, and delivery actions", path: "/operations/service", requiredGrant: "delivery_window" },
      { key: "planning", code: "PL", label: "Planning", detail: "Forecast, demand, and readiness intelligence", path: "/operations/planning", requiredGrant: "planning" },
      { key: "reports", code: "RP", label: "Ops Reports", detail: "Select a service date and review prior-day facts", path: "/prior-day", requiredGrant: "reports" },
      { key: "walk_ons", code: "WO", label: "Walk Ons", detail: "Support identities, dated assignments, and pay treatment", path: "/operations/walk-ons", requiredGrant: "dispatch" },
    ],
  },
  {
    key: "people",
    code: "PE",
    label: "People",
    detail: "Roster, workforce readiness, hiring, and interviews",
    grants: ["roster", "hiring"],
    fallbackPath: "/people",
    children: [
      { code: "RO", label: "Roster", detail: "Active and former team members", path: "/people/roster", requiredGrant: "roster" },
      { code: "WR", label: "Workforce Readiness", detail: "Employment and compliance posture", path: "/people/reports/workforce-readiness", requiredGrant: "roster" },
      { code: "HR", label: "Hiring", detail: "Candidate pipeline and onboarding", path: "/hiring", requiredGrant: "hiring" },
      { code: "IV", label: "Interviews", detail: "Upcoming candidate conversations", path: "/people/interviews", requiredGrant: "hiring" },
    ],
  },
  {
    key: "fleet",
    code: "FL",
    label: "Fleet",
    detail: "Vehicles, open defects, inspections, and maintenance",
    grants: ["fleet"],
    fallbackPath: "/fleet",
    children: [
      { code: "VH", label: "Vehicles", detail: "Unit status and assignment", path: "/fleet", requiredGrant: "fleet" },
      { code: "DF", label: "Defects", detail: "Open vehicle issues", path: "/fleet/defects", requiredGrant: "fleet" },
      { code: "IN", label: "Inspections", detail: "Recent inspection outcomes", path: "/fleet/inspections", requiredGrant: "fleet" },
      { code: "WO", label: "Work Orders", detail: "Maintenance in progress", path: "/fleet/work-orders", requiredGrant: "fleet" },
    ],
  },
  {
    key: "routes",
    code: "RT",
    label: "Routes",
    detail: "Route directory, run pattern, thresholds, and history",
    grants: ["routes"],
    fallbackPath: "/routes",
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
    fallbackPath: "/config",
    children: [
      { code: "CO", label: "Company", detail: "Company and operating configuration", path: "/config", requiredGrant: "admin_config" },
      { code: "AC", label: "Access", detail: "People and workspace grants", path: "/config/access", requiredGrant: "grant_management" },
      { code: "PY", label: "Payroll", detail: "Activity, timekeeping, and exceptions", path: "/payroll/summary", requiredGrant: "payroll" },
      { code: "OA", label: "Opportunities", detail: "Prospective service analysis", path: "/opportunity-analysis", requiredGrant: "opportunity_analysis" },
    ],
  },
  {
    key: "messages",
    code: "MS",
    label: "Messages",
    detail: "Published company updates and acknowledgments",
    grants: [],
    fallbackPath: "/announcements",
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
      (child) => !child.requiredGrant || context.grants.includes(child.requiredGrant),
    ),
  }));
}

export function managerWorkspaceSuite(key: ManagerWorkspaceKey, context?: ManagerAccessContext) {
  const suite = MANAGER_WORKSPACE_SUITES.find((candidate) => candidate.key === key);
  if (!suite) return null;
  if (!context) return suite;
  return {
    ...suite,
    children: suite.children.filter(
      (child) => !child.requiredGrant || context.grants.includes(child.requiredGrant),
    ),
  };
}
