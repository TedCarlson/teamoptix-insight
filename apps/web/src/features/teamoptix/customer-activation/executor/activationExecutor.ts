import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  CompanyActivationRunRecord,
  CompanyActivationStepRecord,
} from "@/features/teamoptix/customer-activation/server/customerActivation.server";

export type ActivationExecutionContext = {
  admin: SupabaseClient;
  actor_user_id: string;
  company_id: string;
  company_slug: string;
  run: CompanyActivationRunRecord;
  steps: CompanyActivationStepRecord[];
};

export type ActivationStepResult = {
  status: "complete" | "failed" | "skipped";
  message?: string;
  metadata?: Record<string, unknown>;
};

export type ActivationStepHandler = (
  context: ActivationExecutionContext,
  step: CompanyActivationStepRecord
) => Promise<ActivationStepResult>;

export type ActivationStepDefinition = {
  key: string;
  order: number;
  execute: ActivationStepHandler;
};

export type ActivationExecutionResult = {
  run_status: "complete" | "partial" | "failed";
  stopped_at_step: string | null;
  executed_steps: string[];
};

async function updateRun(
  admin: SupabaseClient,
  runId: string,
  update: Record<string, unknown>
) {
  const { error } = await admin
    .schema("commercial")
    .from("company_activation_run")
    .update(update)
    .eq("id", runId);

  if (error) {
    throw new Error(
      `Unable to update activation run: ${error.message}`
    );
  }
}

async function updateStep(
  admin: SupabaseClient,
  stepId: string,
  update: Record<string, unknown>
) {
  const { error } = await admin
    .schema("commercial")
    .from("company_activation_step")
    .update(update)
    .eq("id", stepId);

  if (error) {
    throw new Error(
      `Unable to update activation step: ${error.message}`
    );
  }
}

async function markActivationFailed(
  context: ActivationExecutionContext,
  stepKey: string,
  message: string
) {
  const now = new Date().toISOString();
  const subscriptionStep = [
    "create_stripe_subscription",
    "persist_billing_subscription",
  ].includes(stepKey);
  const update: Record<string, unknown> = {
    lifecycle_status: "activation_failed",
    last_transition: `activation_failed:${stepKey}`,
    last_transition_at: now,
    last_transition_by: context.actor_user_id,
  };

  if (subscriptionStep) {
    update.subscription_activation_status = "failed";
  }

  const { error } = await context.admin
    .schema("commercial")
    .from("company_activation")
    .update(update)
    .eq("company_id", context.company_id);

  if (error) {
    throw new Error(
      `${message} Activation failure posture could not be persisted: ${error.message}`
    );
  }
}

export async function executeActivationRun(
  context: ActivationExecutionContext,
  definitions: ActivationStepDefinition[]
): Promise<ActivationExecutionResult> {
  const definitionsByKey = new Map(
    definitions.map((definition) => [
      definition.key,
      definition,
    ])
  );

  const orderedSteps = [...context.steps].sort(
    (a, b) => a.step_order - b.step_order
  );

  const startedAt = new Date().toISOString();

  await updateRun(context.admin, context.run.id, {
    status: "running",
    started_at: context.run.started_at ?? startedAt,
    completed_at: null,
    failure_summary: null,
  });

  const executedSteps: string[] = [];

  for (const step of orderedSteps) {
    if (
      step.status === "complete" ||
      step.status === "skipped"
    ) {
      continue;
    }

    const definition = definitionsByKey.get(step.step_key);

    // An unimplemented step remains pending. The run is partial and
    // can be resumed after its handler is added.
    if (!definition) {
      await updateRun(context.admin, context.run.id, {
        status: "partial",
        completed_at: null,
        failure_summary:
          `Activation paused before unimplemented step: ${step.step_key}.`,
      });

      return {
        run_status: "partial",
        stopped_at_step: step.step_key,
        executed_steps: executedSteps,
      };
    }

    const stepStartedAt = new Date().toISOString();

    await updateStep(context.admin, step.id, {
      status: "running",
      attempt_count: step.attempt_count + 1,
      started_at: stepStartedAt,
      completed_at: null,
      last_error: null,
    });

    try {
      const result = await definition.execute(
        context,
        step
      );

      if (result.status === "failed") {
        const message =
          result.message ??
          `Activation step ${step.step_key} failed.`;

        await updateStep(context.admin, step.id, {
          status: "failed",
          completed_at: new Date().toISOString(),
          last_error: message,
          result_metadata: result.metadata ?? {},
        });

        await updateRun(context.admin, context.run.id, {
          status: "failed",
          completed_at: new Date().toISOString(),
          failure_summary: message,
        });

        await markActivationFailed(context, step.step_key, message);

        return {
          run_status: "failed",
          stopped_at_step: step.step_key,
          executed_steps: executedSteps,
        };
      }

      await updateStep(context.admin, step.id, {
        status: result.status,
        completed_at: new Date().toISOString(),
        last_error: null,
        result_metadata: result.metadata ?? {},
      });

      executedSteps.push(step.step_key);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : `Activation step ${step.step_key} failed.`;

      await updateStep(context.admin, step.id, {
        status: "failed",
        completed_at: new Date().toISOString(),
        last_error: message,
      });

      await updateRun(context.admin, context.run.id, {
        status: "failed",
        completed_at: new Date().toISOString(),
        failure_summary: message,
      });

      await markActivationFailed(context, step.step_key, message);

      return {
        run_status: "failed",
        stopped_at_step: step.step_key,
        executed_steps: executedSteps,
      };
    }
  }

  await updateRun(context.admin, context.run.id, {
    status: "complete",
    completed_at: new Date().toISOString(),
    failure_summary: null,
  });

  return {
    run_status: "complete",
    stopped_at_step: null,
    executed_steps: executedSteps,
  };
}
