import type { CompanyWorkspaceGrantKey } from "@/features/company/config/companyAccessModel";

type Membership = {
  company_slug?: string;
  membership_status?: string;
  relationship_type?: string;
  grants?: unknown;
};

type AccessContext = {
  is_platform_owner?: boolean;
  memberships?: unknown;
};

const COMPANY_GRANTS = new Set<CompanyWorkspaceGrantKey>([
  "schedule", "dispatch", "routes", "planning", "delivery_window",
  "operations_uploads", "reports", "fleet", "roster", "hiring",
  "payroll", "admin_config", "grant_management", "opportunity_analysis",
]);

export function resolveWorkspaceEntry(access: AccessContext | null | undefined) {
  if (access?.is_platform_owner) return "/teamoptix/command-center";

  const memberships = Array.isArray(access?.memberships)
    ? (access.memberships as Membership[]).filter((membership) =>
        membership.membership_status === "active" && Boolean(membership.company_slug)
      )
    : [];

  if (memberships.length === 0) return "/profile";
  if (memberships.length > 1) return "/companies";

  const membership = memberships[0];
  const slug = membership.company_slug as string;
  const grants = Array.isArray(membership.grants)
    ? membership.grants.filter((grant): grant is CompanyWorkspaceGrantKey =>
        typeof grant === "string" && COMPANY_GRANTS.has(grant as CompanyWorkspaceGrantKey)
      )
    : [];

  if (membership.relationship_type === "admin" || grants.length > 0) {
    return `/company/${slug}/workspace`;
  }

  return `/company/${slug}/home`;
}
