import { describe, expect, it } from "vitest";

import { liveBillingRecoveryStepKeys } from "./activationRecovery";

describe("live billing activation recovery", () => {
  it("reopens the provider, persistence, and finalization steps for a legacy placeholder run", () => {
    expect(
      liveBillingRecoveryStepKeys({
        providerSubscriptionId: null,
        subscriptionActivationStatus: "pending",
        lifecycleStatus: "activation_in_progress",
      })
    ).toEqual([
      "create_stripe_subscription",
      "persist_billing_subscription",
      "finalize_activation",
    ]);
  });

  it("only reopens synchronization and finalization when Stripe is already persisted", () => {
    expect(
      liveBillingRecoveryStepKeys({
        providerSubscriptionId: "sub_live_1",
        subscriptionActivationStatus: "pending",
        lifecycleStatus: "activation_in_progress",
      })
    ).toEqual(["persist_billing_subscription", "finalize_activation"]);
  });

  it("leaves a completed live activation untouched", () => {
    expect(
      liveBillingRecoveryStepKeys({
        providerSubscriptionId: "sub_live_1",
        subscriptionActivationStatus: "complete",
        lifecycleStatus: "active",
      })
    ).toEqual([]);
  });
});
