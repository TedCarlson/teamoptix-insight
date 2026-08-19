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
      taxPolicy: {
        taxBehavior: "exclusive",
        taxCode: "txcd_10103001",
        taxCodeSource: "product",
      },
      now: new Date("2026-08-03T16:00:00.000Z"),
    });

    expect(request).toMatchObject({
      params: {
        customer: "cus_live_1",
        items: [{ price: "price_live_weekly_1" }],
        default_payment_method: "pm_live_1",
        automatic_tax: {
          enabled: true,
        },
        collection_method: "charge_automatically",
        payment_behavior: "error_if_incomplete",
        billing_cycle_anchor: Date.UTC(2026, 7, 7, 4, 0, 0) / 1000,
        proration_behavior: "none",
        metadata: {
          source: "insight",
          company_id: "company-1",
          payment_purpose: "subscription",
          first_billing_date: "2026-08-07",
          billing_start_mode: "scheduled_anchor",
          tax_calculation: "automatic",
          tax_behavior: "exclusive",
          tax_code: "txcd_10103001",
          tax_code_source: "product",
        },
      },
      options: {
        idempotencyKey: "insight-company-company-1-initial-subscription-v1",
      },
      schedule: {
        mode: "scheduled_anchor",
        billingCycleAnchor: Date.UTC(2026, 7, 7, 4, 0, 0) / 1000,
      },
    });
  });

  it("omits a past-midnight anchor so Stripe charges immediately on day one", () => {
    const request = buildInitialStripeSubscriptionRequest({
      companyId: "company-1",
      companySlug: "beacon-point-ventures",
      customerId: "cus_live_1",
      priceId: "price_live_weekly_1",
      paymentMethodId: "pm_live_1",
      operatorTierKey: "operator_3",
      firstBillingDate: "2026-08-14",
      implementationPaymentId: "payment-1",
      taxPolicy: {
        taxBehavior: "exclusive",
        taxCode: "txcd_10103001",
        taxCodeSource: "product",
      },
      now: new Date("2026-08-14T10:30:00.000Z"),
    });

    expect(request.params.billing_cycle_anchor).toBeUndefined();
    expect(request.params.payment_behavior).toBe("error_if_incomplete");
    expect(request.params.metadata).toMatchObject({
      billing_start_mode: "immediate_same_day_recovery",
    });
  });
});
