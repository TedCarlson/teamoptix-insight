import type Stripe from "stripe";

import type {
  ActivationStepDefinition,
} from "@/features/teamoptix/customer-activation/executor/activationExecutor";
import {
  calculateFirstFridayAfterGoLive,
  newYorkBillingDateToStripeAnchor,
} from "@/features/teamoptix/customer-activation/lib/billingCalendar";
import { buildInitialStripeSubscriptionRequest } from "@/features/teamoptix/customer-activation/lib/stripeSubscriptionPlan";
import { getStripeServerClient } from "@/lib/stripe/server";
import {
  resolveStripeId,
  stripeSubscriptionRecord,
} from "@/lib/stripe/webhooks/stripeFinanceRecords";

type CommercialProfileRow = {
  company_id: string;
  operator_tier_key: string | null;
  weekly_subscription: number | null;
  billing_email: string | null;
  commercial_status: string | null;
};

type BillingCustomerRow = {
  id: string;
  company_id: string;
  provider: string;
  provider_customer_id: string;
  provider_livemode: boolean | null;
};

type BillingSubscriptionRow = {
  id: string;
  company_id: string;
  customer_id?: string | null;
  billing_customer_id?: string | null;
  provider?: string | null;
  provider_subscription_id?: string | null;
  provider_price_id?: string | null;
  subscription_status?: string | null;
  status?: string | null;
  billing_start_date?: string | null;
  current_period_start?: string | null;
  current_period_end?: string | null;
  activated_at?: string | null;
  activated_by?: string | null;
  metadata?: Record<string, unknown> | null;
};

type OperatorTierRow = {
  tier_key: string;
  weekly_subscription: number | string | null;
  stripe_subscription_product_id: string | null;
  stripe_subscription_price_id: string | null;
};

async function loadCommercialProfile(context: {
  admin: any;
  company_id: string;
}) {
  const { data, error } = await context.admin
    .schema("commercial")
    .from("profile")
    .select(
      "company_id, operator_tier_key, weekly_subscription, billing_email, commercial_status"
    )
    .eq("company_id", context.company_id)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to load commercial profile: ${error.message}`
    );
  }

  return data as CommercialProfileRow | null;
}

async function loadBillingCustomer(context: {
  admin: any;
  company_id: string;
}) {
  const { data, error } = await context.admin
    .schema("billing")
    .from("customer")
    .select("id, company_id, provider, provider_customer_id, provider_livemode")
    .eq("company_id", context.company_id)
    .eq("provider", "stripe")
    .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to load Stripe billing customer: ${error.message}`
    );
  }

  return data as BillingCustomerRow | null;
}

async function loadOperatorTier(context: { admin: any }, tierKey: string) {
  const { data, error } = await context.admin
    .schema("commercial")
    .from("operator_tier")
    .select(
      "tier_key, weekly_subscription, stripe_subscription_product_id, stripe_subscription_price_id"
    )
    .eq("tier_key", tierKey)
    .eq("active", true)
    .maybeSingle();

  if (error) throw new Error(`Unable to load operator tier: ${error.message}`);
  return data as OperatorTierRow | null;
}

async function loadImplementationPayment(context: {
  admin: any;
  company_id: string;
}) {
  const { data, error } = await context.admin
    .schema("billing")
    .from("payment")
    .select("id, provider_payment_intent_id, paid_at")
    .eq("company_id", context.company_id)
    .eq("provider", "stripe")
    .eq("payment_purpose", "implementation")
    .eq("payment_status", "paid")
    .eq("provider_livemode", true)
    .order("paid_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to load implementation payment: ${error.message}`);
  }

  return data as {
    id: string;
    provider_payment_intent_id: string | null;
    paid_at: string | null;
  } | null;
}

async function loadActivation(context: {
  admin: any;
  company_id: string;
}) {
  const { data, error } = await context.admin
    .schema("commercial")
    .from("company_activation")
    .select(
      "company_id, lifecycle_status, first_billing_date, go_live_at, subscription_activation_status"
    )
    .eq("company_id", context.company_id)
    .single();

  if (error) {
    throw new Error(
      `Unable to load company activation: ${error.message}`
    );
  }

  return data as {
    company_id: string;
    lifecycle_status: string;
    first_billing_date: string | null;
    go_live_at: string | null;
    subscription_activation_status: string;
  };
}

async function loadReadiness(context: {
  admin: any;
  company_id: string;
}) {
  const { data, error } = await context.admin
    .schema("commercial")
    .from("company_activation_readiness")
    .select(
      "readiness_key, status, source_basis, completed_at, blocking_reason"
    )
    .eq("company_id", context.company_id);

  if (error) {
    throw new Error(
      `Unable to load activation readiness: ${error.message}`
    );
  }

  return data ?? [];
}

async function loadExistingBillingSubscription(context: {
  admin: any;
  company_id: string;
}) {
  const { data, error } = await context.admin
    .schema("billing")
    .from("subscription")
    .select("*")
    .eq("company_id", context.company_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to load billing subscription: ${error.message}`
    );
  }

  return data as BillingSubscriptionRow | null;
}

export const initialActivationSteps: ActivationStepDefinition[] = [
  {
    key: "validate_readiness",
    order: 1,
    async execute(context) {
      const { data, error } = await context.admin
        .schema("commercial")
        .from("company_activation_readiness")
        .select(
          "readiness_key, status, is_blocking, blocking_reason"
        )
        .eq("company_id", context.company_id);

      if (error) {
        return {
          status: "failed",
          message:
            `Unable to validate Go Live readiness: ${error.message}`,
        };
      }

      const readiness = data ?? [];

      const blockers = readiness.filter(
        (item) =>
          item.is_blocking &&
          item.status === "incomplete"
      );

      if (blockers.length > 0) {
        return {
          status: "failed",
          message:
            `Go Live is blocked by ${blockers.length} incomplete readiness item${
              blockers.length === 1 ? "" : "s"
            }.`,
          metadata: {
            blockers: blockers.map((item) => ({
              readiness_key: item.readiness_key,
              blocking_reason: item.blocking_reason,
            })),
          },
        };
      }

      return {
        status: "complete",
        metadata: {
          readiness_count: readiness.length,
          blocking_count: 0,
        },
      };
    },
  },

  {
    key: "record_go_live_decision",
    order: 2,
    async execute(context) {
      const now = new Date().toISOString();

      const { error } = await context.admin
        .schema("commercial")
        .from("company_activation")
        .update({
          lifecycle_status: "activation_in_progress",
          go_live_requested_at: now,
          go_live_requested_by: context.actor_user_id,
          subscription_activation_status: "pending",
          last_transition: "go_live_requested",
          last_transition_at: now,
          last_transition_by: context.actor_user_id,
        })
        .eq("company_id", context.company_id);

      if (error) {
        return {
          status: "failed",
          message:
            `Unable to record the Go Live decision: ${error.message}`,
        };
      }

      return {
        status: "complete",
        metadata: {
          go_live_requested_at: now,
          requested_by: context.actor_user_id,
        },
      };
    },
  },

  {
    key: "calculate_first_billing_date",
    order: 3,
    async execute(context) {
      const firstBillingDate =
        calculateFirstFridayAfterGoLive(new Date());

      const { error } = await context.admin
        .schema("commercial")
        .from("company_activation")
        .update({
          first_billing_date: firstBillingDate,
        })
        .eq("company_id", context.company_id);

      if (error) {
        return {
          status: "failed",
          message:
            `Unable to persist the first billing date: ${error.message}`,
        };
      }

      return {
        status: "complete",
        metadata: {
          first_billing_date: firstBillingDate,
          timezone: "America/New_York",
          rule: "first Friday strictly after Go Live",
        },
      };
    },
  },

  {
    key: "create_stripe_subscription",
    order: 4,
    async execute(context) {
      const [profile, billingCustomer, activation, existingSubscription, payment] =
        await Promise.all([
          loadCommercialProfile(context),
          loadBillingCustomer(context),
          loadActivation(context),
          loadExistingBillingSubscription(context),
          loadImplementationPayment(context),
        ]);

      if (!profile) {
        return {
          status: "failed",
          message:
            "Unable to create Stripe subscription because the commercial profile is missing.",
        };
      }

      if (!billingCustomer?.provider_customer_id) {
        return {
          status: "failed",
          message:
            "Unable to create Stripe subscription because the Stripe billing customer is missing.",
        };
      }

      if (!profile.operator_tier_key || profile.weekly_subscription == null) {
        return {
          status: "failed",
          message:
            "Unable to create Stripe subscription because tier or weekly subscription is missing.",
          metadata: {
            operator_tier_key: profile.operator_tier_key,
            weekly_subscription: profile.weekly_subscription,
          },
        };
      }

      if (!activation.first_billing_date) {
        return {
          status: "failed",
          message:
            "Unable to create Stripe subscription because first billing date is missing.",
        };
      }

      if (billingCustomer.provider_livemode !== true) {
        return {
          status: "failed",
          message: "Stripe subscription creation requires a verified live-mode billing customer.",
        };
      }

      if (!payment?.provider_payment_intent_id || !payment.paid_at) {
        return {
          status: "failed",
          message: "A paid live-mode implementation Payment Intent is required before subscription creation.",
        };
      }

      const tier = await loadOperatorTier(context, profile.operator_tier_key);
      if (
        !tier?.stripe_subscription_price_id ||
        !tier.stripe_subscription_product_id
      ) {
        return {
          status: "failed",
          message: "The approved operator tier is not mapped to a recurring Stripe product and price.",
        };
      }

      const stripe = getStripeServerClient();
      const [price, implementationIntent] = await Promise.all([
        stripe.prices.retrieve(tier.stripe_subscription_price_id),
        stripe.paymentIntents.retrieve(payment.provider_payment_intent_id),
      ]);
      const priceProductId = resolveStripeId(price.product);
      const expectedWeeklyAmount = Math.round(Number(profile.weekly_subscription) * 100);

      if (
        !price.active ||
        !price.livemode ||
        price.currency !== "usd" ||
        price.unit_amount !== expectedWeeklyAmount ||
        price.recurring?.interval !== "week" ||
        price.recurring.interval_count !== 1 ||
        priceProductId !== tier.stripe_subscription_product_id ||
        Number(tier.weekly_subscription) !== Number(profile.weekly_subscription)
      ) {
        return {
          status: "failed",
          message: "The recurring Stripe price does not match the approved live weekly commercial terms.",
        };
      }

      const paymentMethodId = resolveStripeId(implementationIntent.payment_method);
      if (
        !paymentMethodId ||
        resolveStripeId(implementationIntent.customer) !== billingCustomer.provider_customer_id
      ) {
        return {
          status: "failed",
          message: "The implementation payment did not retain an attributable Stripe payment method for weekly billing.",
        };
      }

      const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
      if (
        resolveStripeId(paymentMethod.customer) !== billingCustomer.provider_customer_id
      ) {
        return {
          status: "failed",
          message: "The retained Stripe payment method is not attached to the approved billing customer.",
        };
      }

      let stripeSubscription: Stripe.Subscription | null = existingSubscription?.provider_subscription_id
        ? await stripe.subscriptions.retrieve(existingSubscription.provider_subscription_id)
        : null;

      if (!stripeSubscription) {
        const providerSubscriptions = await stripe.subscriptions.list({
          customer: billingCustomer.provider_customer_id,
          status: "all",
          limit: 100,
        });
        stripeSubscription =
          providerSubscriptions.data.find(
            (subscription) =>
              subscription.metadata?.source === "insight" &&
              subscription.metadata?.company_id === context.company_id &&
              subscription.status !== "canceled"
          ) ?? null;
      }

      const billingAnchor = newYorkBillingDateToStripeAnchor(
        activation.first_billing_date
      );

      if (!stripeSubscription && billingAnchor <= Math.floor(Date.now() / 1000)) {
        return {
          status: "failed",
          message: "The persisted first billing date is no longer in the future; Team Optix review is required before creating a subscription.",
        };
      }

      if (!stripeSubscription) {
        const request = buildInitialStripeSubscriptionRequest({
          companyId: context.company_id,
          companySlug: context.company_slug,
          customerId: billingCustomer.provider_customer_id,
          priceId: tier.stripe_subscription_price_id,
          paymentMethodId,
          operatorTierKey: profile.operator_tier_key,
          firstBillingDate: activation.first_billing_date,
          implementationPaymentId: payment.id,
        });
        stripeSubscription = await stripe.subscriptions.create(
          request.params,
          request.options
        );
      }

      const mapped = stripeSubscriptionRecord(stripeSubscription);
      const subscriptionPriceId = mapped.provider_price_id;

      if (
        !stripeSubscription.livemode ||
        resolveStripeId(stripeSubscription.customer) !== billingCustomer.provider_customer_id ||
        subscriptionPriceId !== tier.stripe_subscription_price_id ||
        !["active", "trialing"].includes(stripeSubscription.status)
      ) {
        return {
          status: "failed",
          message: "Stripe returned a subscription that does not match the approved customer, price, mode, or activation status.",
          metadata: {
            provider_subscription_id: stripeSubscription.id,
            provider_status: stripeSubscription.status,
          },
        };
      }

      const activatedAt = new Date().toISOString();
      const { error: subscriptionError } = await context.admin
        .schema("billing")
        .from("subscription")
        .upsert(
          {
            ...mapped,
            customer_id: billingCustomer.id,
            company_id: context.company_id,
            operator_tier_key: profile.operator_tier_key,
            weekly_amount: Number(profile.weekly_subscription),
            currency: "usd",
            billing_start_date: activation.first_billing_date,
            activated_at: activatedAt,
            activated_by: context.actor_user_id,
          },
          { onConflict: "provider,provider_subscription_id" }
        );

      if (subscriptionError) {
        return {
          status: "failed",
          message: `Stripe subscription ${stripeSubscription.id} exists but Insight persistence failed: ${subscriptionError.message}`,
          metadata: {
            provider_subscription_id: stripeSubscription.id,
            reconciliation_required: true,
          },
        };
      }

      const { error: activationError } = await context.admin
        .schema("commercial")
        .from("company_activation")
        .update({
          subscription_activation_status: "complete",
          subscription_activated_at: activatedAt,
        })
        .eq("company_id", context.company_id);

      if (activationError) {
        return {
          status: "failed",
          message: `Stripe and Insight subscription records exist but activation synchronization failed: ${activationError.message}`,
          metadata: {
            provider_subscription_id: stripeSubscription.id,
            reconciliation_required: true,
          },
        };
      }

      const { error: customerStatusError } = await context.admin
        .schema("billing")
        .from("customer")
        .update({ billing_status: "active" })
        .eq("id", billingCustomer.id);

      if (customerStatusError) {
        return {
          status: "failed",
          message: `Subscription exists but billing customer status synchronization failed: ${customerStatusError.message}`,
          metadata: {
            provider_subscription_id: stripeSubscription.id,
            reconciliation_required: true,
          },
        };
      }

      return {
        status: "complete",
        metadata: {
          provider: "stripe",
          provider_customer_id: billingCustomer.provider_customer_id,
          provider_subscription_id: stripeSubscription.id,
          provider_price_id: tier.stripe_subscription_price_id,
          provider_status: stripeSubscription.status,
          operator_tier_key: profile.operator_tier_key,
          weekly_subscription: profile.weekly_subscription,
          first_billing_date: activation.first_billing_date,
          billing_cycle_anchor: billingAnchor,
          proration_behavior: "none",
          execution_mode: "live_provider_and_insight_persisted",
        },
      };
    },
  },

  {
    key: "persist_billing_subscription",
    order: 5,
    async execute(context) {
      const [profile, billingCustomer, activation, subscription] =
        await Promise.all([
          loadCommercialProfile(context),
          loadBillingCustomer(context),
          loadActivation(context),
          loadExistingBillingSubscription(context),
        ]);

      if (!profile || !billingCustomer || !activation.first_billing_date) {
        return {
          status: "failed",
          message:
            "Unable to confirm billing subscription persistence because required commercial, billing customer, or first billing date data is missing.",
          metadata: {
            has_profile: Boolean(profile),
            has_billing_customer: Boolean(billingCustomer),
            first_billing_date: activation.first_billing_date,
          },
        };
      }

      if (
        !subscription?.provider_subscription_id ||
        !["active", "trialing"].includes(subscription.subscription_status ?? "")
      ) {
        return {
          status: "failed",
          message: "The live Stripe subscription has not been persisted in an active or trialing state.",
        };
      }

      const activatedAt = subscription.activated_at ?? new Date().toISOString();
      const { error } = await context.admin
        .schema("commercial")
        .from("company_activation")
        .update({
          subscription_activation_status: "complete",
          subscription_activated_at: activatedAt,
        })
        .eq("company_id", context.company_id);

      if (error) {
        return {
          status: "failed",
          message:
            `Unable to persist subscription activation status: ${error.message}`,
        };
      }

      return {
        status: "complete",
        metadata: {
          subscription_record_id: subscription?.id ?? null,
          billing_customer_id: billingCustomer.id,
          provider_customer_id: billingCustomer.provider_customer_id,
          operator_tier_key: profile.operator_tier_key,
          weekly_subscription: profile.weekly_subscription,
          billing_start_date: activation.first_billing_date,
          subscription_activation_status: "complete",
          note: "Live Stripe subscription and Insight billing.subscription record confirmed.",
        },
      };
    },
  },

  {
    key: "enable_automation",
    order: 6,
    async execute(context) {
      const readiness = await loadReadiness(context);
      const automationReadiness = readiness.find(
        (row: { readiness_key: string }) =>
          row.readiness_key === "automation_ready"
      );

      if (!automationReadiness || automationReadiness.status !== "ready") {
        return {
          status: "failed",
          message:
            automationReadiness?.blocking_reason ??
            "Automation readiness has not been confirmed.",
          metadata: {
            automation_readiness_status:
              automationReadiness?.status ?? null,
            automation_readiness_basis:
              automationReadiness?.source_basis ?? null,
          },
        };
      }

      const { data: automationProfile, error: profileError } =
        await context.admin.rpc("get_or_create_automation_profile", {
          p_company_id: context.company_id,
          p_provider_key: "fedex",
        });

      const profileRow = Array.isArray(automationProfile)
        ? automationProfile[0] ?? null
        : automationProfile;

      const { data: schedules, error: scheduleError } =
        await context.admin.rpc(
          "get_operations_automation_schedule_config",
          {
            p_company_slug: context.company_slug,
          }
        );

      const scheduleRows = Array.isArray(schedules)
        ? schedules
        : [];

      return {
        status: "complete",
        metadata: {
          automation_readiness_status:
            automationReadiness.status,
          automation_readiness_basis:
            automationReadiness.source_basis,
          automation_profile_id: profileRow?.id ?? null,
          automation_profile_status: profileRow?.status ?? null,
          automation_profile_warning:
            profileError?.message ?? null,
          schedule_count: scheduleRows.length,
          enabled_schedule_count: scheduleRows.filter(
            (row: { is_enabled?: boolean }) => row.is_enabled
          ).length,
          schedule_warning: scheduleError?.message ?? null,
          note:
            "Automation enablement is governed by the derived automation_ready readiness signal. Profile and schedule state are recorded as supporting metadata.",
        },
      };
    },
  },

  {
    key: "confirm_intelligence_access",
    order: 7,
    async execute(context) {
      const readiness = await loadReadiness(context);

      const requiredKeys = [
        "workspace_ready",
        "automation_ready",
        "credentials_ready",
        "contract_ready",
      ];

      const missing = requiredKeys.filter((key) => {
        const item = readiness.find(
          (row: { readiness_key: string }) =>
            row.readiness_key === key
        );

        return !item || item.status !== "ready";
      });

      if (missing.length > 0) {
        return {
          status: "failed",
          message:
            "Unable to confirm Intelligence access because required readiness signals are missing.",
          metadata: {
            missing_readiness_keys: missing,
          },
        };
      }

      return {
        status: "complete",
        metadata: {
          confirmed_readiness_keys: requiredKeys,
          note:
            "Intelligence access is confirmed through the existing workspace, automation, credentials, and contract readiness signals.",
        },
      };
    },
  },

  {
    key: "enable_notifications",
    order: 8,
    async execute(context) {
      const profile = await loadCommercialProfile(context);

      return {
        status: "skipped",
        metadata: {
          billing_email: profile?.billing_email ?? null,
          reason:
            "Dedicated notification activation subsystem is not implemented yet.",
          note:
            "Verified no-op recorded so activation history remains complete and resumable.",
        },
      };
    },
  },

  {
    key: "finalize_activation",
    order: 9,
    async execute(context) {
      const now = new Date().toISOString();
      const subscription = await loadExistingBillingSubscription(context);

      if (
        !subscription?.provider_subscription_id ||
        !["active", "trialing"].includes(subscription.subscription_status ?? "")
      ) {
        return {
          status: "failed",
          message: "Customer activation cannot finalize without a persisted live Stripe subscription.",
        };
      }

      const { error: activationError } = await context.admin
        .schema("commercial")
        .from("company_activation")
        .update({
          lifecycle_status: "active",
          go_live_at: now,
          go_live_by: context.actor_user_id,
          subscription_activation_status: "complete",
          subscription_activated_at: subscription.activated_at ?? now,
          last_transition: "go_live_finalized",
          last_transition_at: now,
          last_transition_by: context.actor_user_id,
        })
        .eq("company_id", context.company_id);

      if (activationError) {
        return {
          status: "failed",
          message:
            `Unable to finalize customer activation: ${activationError.message}`,
        };
      }

      const { error: profileError } = await context.admin
        .schema("commercial")
        .from("profile")
        .update({
          commercial_status: "subscription_active",
        })
        .eq("company_id", context.company_id);

      if (profileError) {
        return {
          status: "failed",
          message:
            `Unable to finalize commercial profile status: ${profileError.message}`,
        };
      }

      return {
        status: "complete",
        metadata: {
          lifecycle_status: "active",
          commercial_status: "subscription_active",
          go_live_at: now,
          go_live_by: context.actor_user_id,
          subscription_activation_status: "complete",
          provider_subscription_id: subscription.provider_subscription_id,
          note: "Customer lifecycle and live Stripe weekly subscription are active.",
        },
      };
    },
  },
];
