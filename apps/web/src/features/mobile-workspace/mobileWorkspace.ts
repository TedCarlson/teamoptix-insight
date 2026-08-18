import type { CompanyWorkspaceGrantKey } from "@/features/company/config/companyAccessModel";
import type {
  CompanyWorkspaceAccessContext,
  CompanyWorkspaceMembership,
} from "@/features/company/config/companyWorkspaceAccess";

export type MobileWorkspaceIcon =
  | "calendar"
  | "clipboard"
  | "dollar"
  | "route"
  | "settings"
  | "truck"
  | "users";

export type MobileWorkspaceDestination = {
  key: string;
  label: string;
  description: string;
  href: string;
  icon: MobileWorkspaceIcon;
  readiness: "mobile_bridge" | "web_workspace";
  requiredGrant: CompanyWorkspaceGrantKey;
};

export type MobileWorkspaceGroup = {
  key: "operations" | "workforce" | "business";
  label: string;
  destinations: MobileWorkspaceDestination[];
};

const DESTINATIONS: Array<Omit<MobileWorkspaceDestination, "href"> & {
  path: (base: string) => string;
}> = [
  {
    key: "schedule",
    label: "Schedule",
    description: "Open My Schedule or move into calendar and management tools.",
    path: (base) => `${base}/mobile/schedule`,
    icon: "calendar",
    readiness: "mobile_bridge",
    requiredGrant: "schedule",
  },
  {
    key: "dispatch",
    label: "Dispatch",
    description: "Review dispatch posture and route assignments.",
    path: (base) => `${base}/operations/dispatch`,
    icon: "truck",
    readiness: "web_workspace",
    requiredGrant: "dispatch",
  },
  {
    key: "routes",
    label: "Routes",
    description: "Reach route records and route setup.",
    path: (base) => `${base}/routes`,
    icon: "route",
    readiness: "web_workspace",
    requiredGrant: "routes",
  },
  {
    key: "planning",
    label: "Planning",
    description: "Open the operations planning workspace.",
    path: (base) => `${base}/operations/planning`,
    icon: "clipboard",
    readiness: "web_workspace",
    requiredGrant: "planning",
  },
  {
    key: "delivery-window",
    label: "Delivery Window",
    description: "Monitor in-day service and delivery completion.",
    path: (base) => `${base}/operations/delivery-window`,
    icon: "truck",
    readiness: "web_workspace",
    requiredGrant: "delivery_window",
  },
  {
    key: "operations-uploads",
    label: "Operations Uploads",
    description: "Open operations to stage DSW, DRO, and FCC reports.",
    path: (base) => `${base}/operations`,
    icon: "clipboard",
    readiness: "web_workspace",
    requiredGrant: "operations_uploads",
  },
  {
    key: "reports",
    label: "Ops Reports",
    description: "Review previous-day operational reporting.",
    path: (base) => `${base}/prior-day`,
    icon: "clipboard",
    readiness: "web_workspace",
    requiredGrant: "reports",
  },
  {
    key: "fleet",
    label: "Fleet",
    description: "Reach vehicles, maintenance, and inspection history.",
    path: (base) => `${base}/fleet`,
    icon: "truck",
    readiness: "web_workspace",
    requiredGrant: "fleet",
  },
  {
    key: "roster",
    label: "Roster",
    description: "Review active and former workforce records.",
    path: (base) => `${base}/people/roster`,
    icon: "users",
    readiness: "web_workspace",
    requiredGrant: "roster",
  },
  {
    key: "hiring",
    label: "Hiring",
    description: "Reach the candidate pipeline and interviews.",
    path: (base) => `${base}/hiring`,
    icon: "users",
    readiness: "web_workspace",
    requiredGrant: "hiring",
  },
  {
    key: "payroll",
    label: "Payroll",
    description: "Open summaries, compliance, and time tracking.",
    path: (base) => `${base}/payroll/summary`,
    icon: "dollar",
    readiness: "web_workspace",
    requiredGrant: "payroll",
  },
  {
    key: "company-config",
    label: "Company Config",
    description: "Manage company, leadership, and operations settings.",
    path: (base) => `${base}/config`,
    icon: "settings",
    readiness: "web_workspace",
    requiredGrant: "admin_config",
  },
  {
    key: "access-management",
    label: "Access Management",
    description: "Review people and update workspace grants.",
    path: (base) => `${base}/config/access`,
    icon: "settings",
    readiness: "web_workspace",
    requiredGrant: "grant_management",
  },
  {
    key: "opportunity-analysis",
    label: "Opportunity Analysis",
    description: "Evaluate prospective contracted service opportunities.",
    path: (base) => `${base}/opportunity-analysis`,
    icon: "dollar",
    readiness: "web_workspace",
    requiredGrant: "opportunity_analysis",
  },
];

const MOBILE_WORKSPACE_GRANTS = Array.from(
  new Set(DESTINATIONS.map((destination) => destination.requiredGrant))
);

function activeMembership(
  access: CompanyWorkspaceAccessContext | null | undefined,
  slug: string
): CompanyWorkspaceMembership | null {
  const memberships = Array.isArray(access?.memberships)
    ? (access.memberships as CompanyWorkspaceMembership[])
    : [];

  return memberships.find((membership) =>
    membership.company_slug === slug && membership.membership_status === "active"
  ) ?? null;
}

export function isCompanyAdminAccess(
  access: CompanyWorkspaceAccessContext | null | undefined,
  slug: string
) {
  if (access?.is_platform_owner) return true;
  return activeMembership(access, slug)?.relationship_type === "admin";
}

export function mobileWorkspaceGrantKeys(
  access: CompanyWorkspaceAccessContext | null | undefined,
  slug: string
): CompanyWorkspaceGrantKey[] {
  const membership = activeMembership(access, slug);
  if (!membership && !access?.is_platform_owner) return [];

  if (isCompanyAdminAccess(access, slug)) {
    return MOBILE_WORKSPACE_GRANTS;
  }

  const validKeys = new Set(MOBILE_WORKSPACE_GRANTS);
  const grants = Array.isArray(membership?.grants) ? membership.grants : [];

  return grants.filter(
    (grant): grant is CompanyWorkspaceGrantKey =>
      typeof grant === "string" && validKeys.has(grant as CompanyWorkspaceGrantKey)
  );
}

export function hasMobileWorkspaceAccess(
  access: CompanyWorkspaceAccessContext | null | undefined,
  slug: string
) {
  return mobileWorkspaceGrantKeys(access, slug).length > 0;
}

export function buildMobileWorkspaceGroups(
  access: CompanyWorkspaceAccessContext | null | undefined,
  slug: string
): MobileWorkspaceGroup[] {
  const allowed = new Set(mobileWorkspaceGrantKeys(access, slug));
  const base = `/company/${slug}`;
  const destinations = DESTINATIONS
    .filter((destination) => allowed.has(destination.requiredGrant))
    .map(({ path, ...destination }) => ({
      ...destination,
      href: path(base),
    }));

  const groups: MobileWorkspaceGroup[] = [
    {
      key: "operations",
      label: "Operations",
      destinations: destinations.filter((destination) =>
        ["schedule", "dispatch", "routes", "planning", "delivery_window", "operations_uploads", "reports", "fleet"]
          .includes(destination.requiredGrant)
      ),
    },
    {
      key: "workforce",
      label: "Workforce",
      destinations: destinations.filter((destination) =>
        ["roster", "hiring"].includes(destination.requiredGrant)
      ),
    },
    {
      key: "business",
      label: "Business & Admin",
      destinations: destinations.filter((destination) =>
        ["payroll", "admin_config", "grant_management", "opportunity_analysis"]
          .includes(destination.requiredGrant)
      ),
    },
  ];

  return groups.filter((group) => group.destinations.length > 0);
}
