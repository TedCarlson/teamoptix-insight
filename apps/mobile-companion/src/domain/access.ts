export const COMPANY_WORKSPACE_GRANTS = [
  "schedule",
  "dispatch",
  "routes",
  "planning",
  "delivery_window",
  "operations_uploads",
  "reports",
  "fleet",
  "roster",
  "hiring",
  "payroll",
  "admin_config",
  "grant_management",
  "opportunity_analysis",
] as const;

export type CompanyWorkspaceGrantKey = typeof COMPANY_WORKSPACE_GRANTS[number];

export type AccessContextMembership = {
  company_id: string;
  company_name: string;
  company_slug: string;
  company_status?: string | null;
  experience_mode?: "LIVE" | "DEMO" | null;
  relationship_type: string;
  membership_status: string;
  title?: string | null;
  grants?: unknown;
};

export type AccessContextResponse = {
  profile_id?: string | null;
  display_name?: string | null;
  is_platform_owner?: boolean | null;
  memberships?: unknown;
};

export type DriverAccessGate = {
  company_id: string;
  company_name: string;
  company_slug: string;
  roster_member_id: string;
  driver_name: string;
  access_mode: "DRIVER" | "ADMIN_DEMO";
};

type BaseMobileContext = {
  company_id: string;
  company_name: string;
  company_slug: string;
  experience_mode: "LIVE" | "DEMO";
  context_key: string;
  relationship_type: string;
  title: string | null;
};

export type ManagerAccessContext = BaseMobileContext & {
  role: "MANAGER";
  grants: CompanyWorkspaceGrantKey[];
  is_platform_owner?: boolean;
};

export type DriverAccessContext = BaseMobileContext & {
  role: "DRIVER";
  roster_member_id: string;
  driver_name: string;
  access_mode: "DRIVER" | "ADMIN_DEMO";
};

export type MobileAccessContext = ManagerAccessContext | DriverAccessContext;

const validGrants = new Set<string>(COMPANY_WORKSPACE_GRANTS);

export function driverAccessContextKey(access: DriverAccessGate) {
  return access.access_mode === "ADMIN_DEMO"
    ? `${access.company_id}:${access.roster_member_id}`
    : access.company_id;
}

export function isDriverAccessContext(
  context: MobileAccessContext | null | undefined,
): context is DriverAccessContext {
  return context?.role === "DRIVER";
}

export function isManagerAccessContext(
  context: MobileAccessContext | null | undefined,
): context is ManagerAccessContext {
  return context?.role === "MANAGER";
}

function normalizedGrants(
  membership: AccessContextMembership,
  isPlatformOwner: boolean,
) {
  if (
    membership.experience_mode !== "DEMO"
    && (isPlatformOwner || membership.relationship_type === "admin")
  ) {
    return [...COMPANY_WORKSPACE_GRANTS];
  }
  if (!Array.isArray(membership.grants)) return [];
  return Array.from(new Set(membership.grants)).filter(
    (grant): grant is CompanyWorkspaceGrantKey =>
      typeof grant === "string" && validGrants.has(grant),
  );
}

export function buildMobileAccessContexts(
  access: AccessContextResponse | null | undefined,
  driverGates: DriverAccessGate[],
): MobileAccessContext[] {
  const memberships = Array.isArray(access?.memberships)
    ? access.memberships as AccessContextMembership[]
    : [];
  const activeMemberships = memberships.filter(
    (membership) =>
      membership.membership_status === "active"
      && (!membership.company_status || membership.company_status === "active"),
  );
  const membershipByCompany = new Map(
    activeMemberships.map((membership) => [membership.company_id, membership]),
  );
  const contexts: MobileAccessContext[] = [];

  for (const membership of activeMemberships) {
    const grants = normalizedGrants(membership, Boolean(access?.is_platform_owner));
    if (grants.length === 0) continue;
    contexts.push({
      role: "MANAGER",
      company_id: membership.company_id,
      company_name: membership.company_name,
      company_slug: membership.company_slug,
      experience_mode: membership.experience_mode ?? "LIVE",
      context_key: `manager:${membership.company_id}`,
      relationship_type: membership.relationship_type,
      title: membership.title ?? null,
      grants,
      is_platform_owner: Boolean(access?.is_platform_owner),
    });
  }

  if (access?.is_platform_owner) {
    for (const gate of driverGates) {
      if (contexts.some((context) =>
        context.role === "MANAGER" && context.company_id === gate.company_id
      )) {
        continue;
      }
      contexts.push({
        role: "MANAGER",
        company_id: gate.company_id,
        company_name: gate.company_name,
        company_slug: gate.company_slug,
        experience_mode: "LIVE",
        context_key: `manager:${gate.company_id}`,
        relationship_type: "admin",
        title: "Platform owner",
        grants: [...COMPANY_WORKSPACE_GRANTS],
        is_platform_owner: true,
      });
    }
  }

  const demoCompanies = new Set<string>();
  for (const gate of driverGates) {
    if (gate.access_mode === "ADMIN_DEMO") {
      if (demoCompanies.has(gate.company_id)) continue;
      demoCompanies.add(gate.company_id);
    }
    const membership = membershipByCompany.get(gate.company_id);
    contexts.push({
      ...gate,
      role: "DRIVER",
      experience_mode: membership?.experience_mode
        ?? (gate.access_mode === "ADMIN_DEMO" ? "DEMO" : "LIVE"),
      context_key: driverAccessContextKey(gate),
      relationship_type: membership?.relationship_type ?? "member",
      title: membership?.title ?? null,
    });
  }

  const unique = Array.from(
    new Map(contexts.map((context) => [context.context_key, context])).values(),
  );
  return unique.sort((left, right) =>
    left.company_name.localeCompare(right.company_name)
    || (left.role === right.role ? 0 : left.role === "MANAGER" ? -1 : 1)
    || (left.role === "DRIVER" && right.role === "DRIVER"
      ? left.driver_name.localeCompare(right.driver_name)
      : 0),
  );
}

export function managerContextForCompany(
  contexts: MobileAccessContext[],
  companyId: string,
) {
  return contexts.find(
    (context): context is ManagerAccessContext =>
      context.role === "MANAGER" && context.company_id === companyId,
  ) ?? null;
}

export function driverContextForCompany(
  contexts: MobileAccessContext[],
  companyId: string,
) {
  return contexts.find(
    (context): context is DriverAccessContext =>
      context.role === "DRIVER"
      && context.company_id === companyId
      && context.access_mode === "DRIVER",
  ) ?? null;
}
