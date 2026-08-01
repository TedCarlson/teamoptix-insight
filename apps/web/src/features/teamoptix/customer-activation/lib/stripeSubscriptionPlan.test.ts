import { describe, expect, it } from "vitest";

import { buildInitialStripeSubscriptionRequest } from "./stripeSubscriptionPlan";

describe("initial Stripe subscription request", () => {
  it("uses the persisted Friday anchor, saved payment method, and no proration", () => {
    const request = buildInitialStripeSubscriptionRequest({
      companyId: "company-1",
      companySlug: "beacon-point-ventures",
      customerId: "cus_live_1",
      priceId: "price_live_weekly_1",
      paymentMethodId: "pm_live_1",
      operatorTierKey: "operator_3",
      firstBillingDate: "2026-08-07",
      implementationPaymentId: "payment-1",
    });

    expect(request).toMatchObject({
      params: {
        customer: "cus_live_1",
        items: [{ price: "price_live_weekly_1" }],
        default_payment_method: "pm_live_1",
        collection_method: "charge_automatically",
        billing_cycle_anchor: Date.UTC(2026, 7, 7, 4, 0, 0) / 1000,
        proration_behavior: "none",
        metadata: {
          source: "insight",
          company_id: "company-1",
          payment_purpose: "subscription",
          first_billing_date: "2026-08-07",
        },
      },
      options: {
        idempotencyKey: "insight-company-company-1-initial-subscription-v1",
      },
    });
  });
});
