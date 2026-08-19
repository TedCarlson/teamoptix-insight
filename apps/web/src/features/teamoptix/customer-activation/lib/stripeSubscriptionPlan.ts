import type Stripe from "stripe";

import {
  stripeAutomaticTaxMetadata,
  type StripeTaxPolicy,
} from "@/lib/stripe/taxPolicy";
import { resolveInitialStripeBillingSchedule } from "./billingCalendar";

export function buildInitialStripeSubscriptionRequest(input: {
  companyId: string;
  companySlug: string;
  customerId: string;
  priceId: string;
  paymentMethodId: string;
  operatorTierKey: string;
  firstBillingDate: string;
  implementationPaymentId: string;
  taxPolicy: StripeTaxPolicy;
  now?: Date;
}): {
  params: Stripe.SubscriptionCreateParams;
  options: Stripe.RequestOptions;
  schedule: ReturnType<typeof resolveInitialStripeBillingSchedule>;
} {
  const schedule = resolveInitialStripeBillingSchedule(
    input.firstBillingDate,
    input.now
  );
  const params: Stripe.SubscriptionCreateParams = {
    customer: input.customerId,
    items: [{ price: input.priceId }],
    default_payment_method: input.paymentMethodId,
    automatic_tax: {
      enabled: true,
    },
    collection_method: "charge_automatically",
    payment_behavior: "error_if_incomplete",
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
      billing_start_mode: schedule.mode,
      implementation_payment_id: input.implementationPaymentId,
      ...stripeAutomaticTaxMetadata(input.taxPolicy),
    },
  };

  if (schedule.billingCycleAnchor != null) {
    params.billing_cycle_anchor = schedule.billingCycleAnchor;
  }

  return {
    params,
    options: {
      idempotencyKey: `insight-company-${input.companyId}-initial-subscription-v1`,
    },
    schedule,
  };
}
