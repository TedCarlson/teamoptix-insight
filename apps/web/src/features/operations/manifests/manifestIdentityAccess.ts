export type ManifestIdentityAccess = {
  verified: boolean;
  mode: "FULL" | "REDACTED";
  verified_at: string | null;
  reason: "VERIFIED_CREDENTIAL" | "CREDENTIAL_NOT_VERIFIED";
};

export function resolveManifestIdentityAccess(input: {
  profileStatus?: string | null;
  hasSecret?: boolean | null;
  lastVerifiedAt?: string | null;
  lastVerificationResult?: string | null;
}): ManifestIdentityAccess {
  const verified =
    String(input.profileStatus ?? "").toUpperCase() === "HEALTHY" &&
    input.hasSecret === true &&
    Boolean(String(input.lastVerifiedAt ?? "").trim()) &&
    String(input.lastVerificationResult ?? "").toUpperCase() === "SUCCESS";

  return {
    verified,
    mode: verified ? "FULL" : "REDACTED",
    verified_at: verified ? input.lastVerifiedAt ?? null : null,
    reason: verified ? "VERIFIED_CREDENTIAL" : "CREDENTIAL_NOT_VERIFIED",
  };
}

const IDENTITY_FIELDS = [
  "recipient",
  "recipient_name",
  "contact_name",
  "shipper_name",
] as const;

export function applyManifestIdentityAccess(
  row: Record<string, unknown>,
  access: ManifestIdentityAccess
) {
  if (access.verified) return row;

  const redacted = { ...row };
  for (const field of IDENTITY_FIELDS) {
    if (field in redacted) redacted[field] = null;
  }
  return redacted;
}
