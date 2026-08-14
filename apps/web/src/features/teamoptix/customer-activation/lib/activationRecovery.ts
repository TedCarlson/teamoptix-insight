const CREATE_SUBSCRIPTION_STEP = "create_stripe_subscription";
const PERSIST_SUBSCRIPTION_STEP = "persist_billing_subscription";
const FINALIZE_ACTIVATION_STEP = "finalize_activation";

export function liveBillingRecoveryStepKeys(input: {
  providerSubscriptionId: string | null;
  subscriptionActivationStatus: string;
  lifecycleStatus: string;
}): string[] {
  const keys: string[] = [];
  const hasProviderSubscription = Boolean(input.providerSubscriptionId);
  const subscriptionComplete =
    input.subscriptionActivationStatus === "complete";

  if (!hasProviderSubscription) keys.push(CREATE_SUBSCRIPTION_STEP);
  if (!hasProviderSubscription || !subscriptionComplete) {
    keys.push(PERSIST_SUBSCRIPTION_STEP);
  }
  if (input.lifecycleStatus !== "active" || !subscriptionComplete) {
    keys.push(FINALIZE_ACTIVATION_STEP);
  }

  return keys;
}
