export const ITF_WORKSPACE_GRANT = "insight_telecom_fulfillment" as const;

export type ItfWorkspaceContext = {
  company_id: string;
  company_name: string;
  company_slug: string;
  company_status: string;
  product_key: "insight-telecom-fulfillment";
  product_name: "Insight - Telecom Fulfillment";
  entitlement_status: string | null;
  entitlement_source: string | null;
  relationship_type: string | null;
  authorization_source:
    | "platform_owner"
    | "platform_preview"
    | "company_admin"
    | "company_grant"
    | "delegated_session"
    | null;
  access_reason:
    | "authorized"
    | "foundation_preview"
    | "product_not_entitled"
    | "workspace_grant_required";
  can_enter: boolean;
  can_manage: boolean;
  is_platform_preview: boolean;
};

export type ItfFallbackAccess = {
  is_platform_owner?: boolean;
  memberships?: Array<{
    company_id?: string;
    company_name?: string;
    company_slug?: string;
    company_status?: string;
    membership_status?: string;
    relationship_type?: string;
    grants?: unknown;
  }>;
};

export function buildItfFoundationPreview(
  access: ItfFallbackAccess | null | undefined,
  company: {
    id: string;
    company_name: string;
    company_slug: string;
    company_status: string;
  }
): ItfWorkspaceContext | null {
  const membership = access?.memberships?.find(
    (item) =>
      item.company_slug === company.company_slug &&
      item.membership_status === "active"
  );
  const grants = Array.isArray(membership?.grants) ? membership.grants : [];
  const isPlatformOwner = Boolean(access?.is_platform_owner);
  const isAdmin = membership?.relationship_type === "admin";
  const hasGrant = grants.includes(ITF_WORKSPACE_GRANT);

  if (!isPlatformOwner && !isAdmin && !hasGrant) return null;

  return {
    company_id: company.id,
    company_name: company.company_name,
    company_slug: company.company_slug,
    company_status: company.company_status,
    product_key: "insight-telecom-fulfillment",
    product_name: "Insight - Telecom Fulfillment",
    entitlement_status: null,
    entitlement_source: null,
    relationship_type: membership?.relationship_type ?? null,
    authorization_source: isPlatformOwner
      ? "platform_preview"
      : isAdmin
        ? "company_admin"
        : "company_grant",
    access_reason: "foundation_preview",
    can_enter: true,
    can_manage: isPlatformOwner || isAdmin,
    is_platform_preview: isPlatformOwner,
  };
}

export function isItfWorkspaceContext(value: unknown): value is ItfWorkspaceContext {
  if (!value || typeof value !== "object") return false;
  const context = value as Partial<ItfWorkspaceContext>;

  return (
    typeof context.company_id === "string" &&
    typeof context.company_name === "string" &&
    typeof context.company_slug === "string" &&
    context.product_key === "insight-telecom-fulfillment" &&
    typeof context.can_enter === "boolean" &&
    typeof context.can_manage === "boolean"
  );
}
