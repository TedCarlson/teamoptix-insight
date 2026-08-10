import type { CompanyWorkspaceGrantKey } from "./companyAccessModel";

export type CompanyWorkspaceMembership = {
  company_slug?: string;
  relationship_type?: string;
  membership_status?: string;
  grants?: unknown;
};

export type CompanyWorkspaceAccessContext = {
  is_platform_owner?: boolean;
  memberships?: unknown;
};

export function canAccessCompanyWorkspace(
  access: CompanyWorkspaceAccessContext | null | undefined,
  companySlug: string,
  grantKey: CompanyWorkspaceGrantKey
): boolean {
  if (access?.is_platform_owner) return true;

  const memberships = Array.isArray(access?.memberships)
    ? (access.memberships as CompanyWorkspaceMembership[])
    : [];
  const membership = memberships.find(
    (item) => item.company_slug === companySlug
  );

  if (membership?.membership_status !== "active") return false;
  if (membership.relationship_type === "admin") return true;

  return Array.isArray(membership.grants)
    && membership.grants.includes(grantKey);
}
