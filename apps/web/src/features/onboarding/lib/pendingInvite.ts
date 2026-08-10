export type PendingMembership = {
  company_id?: string;
  company_name?: string;
  company_slug?: string;
  company_status?: string;
  membership_status?: string;
};

export function activePendingMemberships(value: unknown): PendingMembership[] {
  if (!Array.isArray(value)) return [];

  return value.filter(
    (membership): membership is PendingMembership =>
      Boolean(membership) &&
      typeof membership === "object" &&
      membership.membership_status === "pending" &&
      membership.company_status === "active" &&
      typeof membership.company_id === "string"
  );
}

export function pendingInviteHref(token: string, sessionId?: string | null) {
  return sessionId
    ? `/onboarding/start/${sessionId}`
    : `/onboarding/invite/${token}`;
}
