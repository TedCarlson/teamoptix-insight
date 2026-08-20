export type StripeCredentialRotationState = {
  status: "idle" | "error" | "partial" | "success";
  message: string | null;
  credentialLabel?: string;
  deploymentId?: string;
  deploymentUrl?: string | null;
};

export const INITIAL_STRIPE_CREDENTIAL_ROTATION_STATE: StripeCredentialRotationState = {
  status: "idle",
  message: null,
};
