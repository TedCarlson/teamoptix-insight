import type {
  ActivationStepDefinition,
} from "@/features/teamoptix/customer-activation/executor/activationExecutor";

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
    .select("id, company_id, provider, provider_customer_id")
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
      const { calculateFirstFridayAfterGoLive } =
        await import(
          "@/features/teamoptix/customer-activation/server/customerActivation.server"
        );

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
      const [profile, billingCustomer, activation] =
        await Promise.all([
          loadCommercialProfile(context),
          loadBillingCustomer(context),
          loadActivation(context),
        ]);

      if (!profile) {
        return {
          status: "failed",
          message:
            "Unable to queue Stripe subscription because the commercial profile is missing.",
        };
      }

      if (!billingCustomer?.provider_customer_id) {
        return {
          status: "failed",
          message:
            "Unable to queue Stripe subscription because the Stripe billing customer is missing.",
        };
      }

      if (!profile.operator_tier_key || profile.weekly_subscription == null) {
        return {
          status: "failed",
          message:
            "Unable to queue Stripe subscription because tier or weekly subscription is missing.",
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
            "Unable to queue Stripe subscription because first billing date is missing.",
        };
      }

      return {
        status: "complete",
        metadata: {
          provider: "stripe",
          provider_customer_id: billingCustomer.provider_customer_id,
          operator_tier_key: profile.operator_tier_key,
          weekly_subscription: profile.weekly_subscription,
          first_billing_date: activation.first_billing_date,
          execution_mode:
            "verified_queue_only_until_subscription_creation_sprint",
          note:
            "Stripe subscription creation is intentionally not executed here yet; production/live subscription execution remains a later Track B step.",
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

      const { error } = await context.admin
        .schema("commercial")
        .from("company_activation")
        .update({
          subscription_activation_status: "pending",
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
        status: subscription ? "complete" : "skipped",
        metadata: {
          subscription_record_id: subscription?.id ?? null,
          billing_customer_id: billingCustomer.id,
          provider_customer_id: billingCustomer.provider_customer_id,
          operator_tier_key: profile.operator_tier_key,
          weekly_subscription: profile.weekly_subscription,
          billing_start_date: activation.first_billing_date,
          subscription_activation_status: "pending",
          note: subscription
            ? "Existing billing.subscription record confirmed."
            : "billing.subscription persistence is deferred until provider subscription creation is implemented.",
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

      const { error: activationError } = await context.admin
        .schema("commercial")
        .from("company_activation")
        .update({
          lifecycle_status: "active",
          go_live_at: now,
          go_live_by: context.actor_user_id,
          subscription_activation_status: "pending",
          subscription_activated_at: null,
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
          subscription_activation_status: "pending",
          note:
            "Customer lifecycle is active. Provider subscription execution remains pending until Stripe subscription creation is implemented.",
        },
      };
    },
  },
];
