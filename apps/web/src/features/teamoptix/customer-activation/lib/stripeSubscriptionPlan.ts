import type Stripe from "stripe";

import { newYorkBillingDateToStripeAnchor } from "./billingCalendar";

export function buildInitialStripeSubscriptionRequest(input: {
  companyId: string;
  companySlug: string;
  customerId: string;
  priceId: string;
  paymentMethodId: string;
  operatorTierKey: string;
  firstBillingDate: string;
  implementationPaymentId: string;
}): {
  params: Stripe.SubscriptionCreateParams;
  options: Stripe.RequestOptions;
} {
  return {
    params: {
      customer: input.customerId,
      items: [{ price: input.priceId }],
      default_payment_method: input.paymentMethodId,
      collection_method: "charge_automatically",
      billing_cycle_anchor: newYorkBillingDateToStripeAnchor(
        input.firstBillingDate
      ),
      proration_behavior: "none",
      payment_settings: {
        save_default_payment_method: "on_subscription",
      },
      metadata: {
        source: "insight",
        company_id: input.companyId,
        company_slug: input.companySlug,
        operator_tier_key: input.operatorTierKey,
        payment_purpose: "subscription",
        first_billing_date: input.firstBillingDate,
        implementation_payment_id: input.implementationPaymentId,
      },
    },
    options: {
      idempotencyKey: `insight-company-${input.companyId}-initial-subscription-v1`,
    },
  };
}
