import type {
  ActivationStepDefinition,
} from "@/features/teamoptix/customer-activation/executor/activationExecutor";

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
];
