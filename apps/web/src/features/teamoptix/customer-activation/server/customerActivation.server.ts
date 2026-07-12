import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export type ActivationLifecycleStatus =
  | "implementation"
  | "ready_for_go_live"
  | "activation_in_progress"
  | "active"
  | "activation_failed"
  | "paused"
  | "cancelled"
  | "archived";

export type SubscriptionActivationStatus =
  | "not_started"
  | "pending"
  | "running"
  | "complete"
  | "failed"
  | "skipped";

export type ActivationReadinessKey =
  | "commercial_ready"
  | "implementation_payment_ready"
  | "contract_ready"
  | "workspace_ready"
  | "credentials_ready"
  | "automation_ready"
  | "training_ready"
  | "customer_approval_ready";

export type ActivationReadinessStatus =
  | "incomplete"
  | "ready"
  | "not_applicable";

export type ActivationRunStatus =
  | "pending"
  | "running"
  | "complete"
  | "partial"
  | "failed";

export type ActivationStepStatus =
  | "pending"
  | "running"
  | "complete"
  | "failed"
  | "skipped";

type AccessContext = {
  auth_user_id?: string | null;
  profile_id?: string | null;
  is_platform_owner?: boolean;
};

type CompanyRecord = {
  id: string;
  company_name: string;
  company_slug: string;
  company_status: string;
  created_at: string;
};

type CommercialReadinessProfile = {
  operator_tier_key: string | null;
  implementation_fee: number | null;
  weekly_subscription: number | null;
  billing_email: string | null;
  commercial_status: string;
};

type ImplementationPaymentRecord = {
  id: string;
  amount: number;
  currency: string;
  payment_status: string;
  paid_at: string | null;
  provider_event_id: string | null;
};

export type CompanyActivationRecord = {
  id: string;
  company_id: string;
  lifecycle_status: ActivationLifecycleStatus;
  implementation_started_at: string | null;
  implementation_completed_at: string | null;
  ready_for_go_live_at: string | null;
  go_live_requested_at: string | null;
  go_live_at: string | null;
  paused_at: string | null;
  cancelled_at: string | null;
  reactivated_at: string | null;
  archived_at: string | null;
  implementation_payment_received_at: string | null;
  first_billing_date: string | null;
  subscription_activation_status: SubscriptionActivationStatus;
  subscription_activated_at: string | null;
  last_transition: string;
  last_transition_at: string;
  last_transition_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CompanyActivationReadinessRecord = {
  id: string;
  company_id: string;
  readiness_key: ActivationReadinessKey;
  status: ActivationReadinessStatus;
  source_type: "computed" | "manual" | "provider" | "system";
  source_basis: string | null;
  is_blocking: boolean;
  completed_at: string | null;
  completed_by: string | null;
  blocking_reason: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type CompanyActivationRunRecord = {
  id: string;
  company_id: string;
  run_type: "go_live" | "resume" | "reactivation";
  status: ActivationRunStatus;
  requested_at: string;
  requested_by: string;
  started_at: string | null;
  completed_at: string | null;
  failure_summary: string | null;
  idempotency_key: string;
  created_at: string;
  updated_at: string;
};

export type CompanyActivationStepRecord = {
  id: string;
  activation_run_id: string;
  step_key: string;
  step_order: number;
  status: ActivationStepStatus;
  attempt_count: number;
  started_at: string | null;
  completed_at: string | null;
  last_error: string | null;
  result_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type CompanyActivationSnapshot = {
  company: CompanyRecord;
  activation: CompanyActivationRecord;
  readiness: CompanyActivationReadinessRecord[];
  latest_run: CompanyActivationRunRecord | null;
  latest_run_steps: CompanyActivationStepRecord[];
  blocking_readiness: CompanyActivationReadinessRecord[];
  is_ready_for_go_live: boolean;
};

export class CustomerActivationError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(
    message: string,
    options: {
      status: number;
      code: string;
    }
  ) {
    super(message);
    this.name = "CustomerActivationError";
    this.status = options.status;
    this.code = options.code;
  }
}

const READINESS_DEFAULTS: ReadonlyArray<{
  readiness_key: ActivationReadinessKey;
  source_type: "computed" | "manual";
  blocking_reason: string;
}> = [
  {
    readiness_key: "commercial_ready",
    source_type: "computed",
    blocking_reason:
      "Commercial profile has not yet been verified for Go Live.",
  },
  {
    readiness_key: "implementation_payment_ready",
    source_type: "computed",
    blocking_reason:
      "Implementation payment has not yet been verified.",
  },
  {
    readiness_key: "contract_ready",
    source_type: "manual",
    blocking_reason:
      "Customer agreement has not yet been acknowledged.",
  },
  {
    readiness_key: "workspace_ready",
    source_type: "manual",
    blocking_reason:
      "Workspace readiness has not yet been acknowledged.",
  },
  {
    readiness_key: "credentials_ready",
    source_type: "manual",
    blocking_reason:
      "Required customer credentials have not yet been verified.",
  },
  {
    readiness_key: "automation_ready",
    source_type: "manual",
    blocking_reason:
      "Automation configuration has not yet been verified.",
  },
  {
    readiness_key: "training_ready",
    source_type: "manual",
    blocking_reason:
      "Customer training has not yet been acknowledged.",
  },
  {
    readiness_key: "customer_approval_ready",
    source_type: "manual",
    blocking_reason:
      "Customer approval to Go Live has not yet been recorded.",
  },
];

function throwDatabaseError(
  operation: string,
  error: {
    message?: string;
    code?: string;
    details?: string;
    hint?: string;
  } | null
): never {
  const detail = [
    error?.message,
    error?.details,
    error?.hint,
  ]
    .filter(Boolean)
    .join(" ");

  throw new CustomerActivationError(
    detail
      ? `${operation}: ${detail}`
      : `${operation} failed.`,
    {
      status: 500,
      code: error?.code ?? "activation_database_error",
    }
  );
}

async function requirePlatformOwner(): Promise<{
  actorUserId: string;
  access: AccessContext;
  admin: SupabaseClient;
}> {
  const sessionClient = await getSupabaseServerClient();

  const {
    data: { user },
    error: userError,
  } = await sessionClient.auth.getUser();

  if (userError) {
    throw new CustomerActivationError(
      userError.message,
      {
        status: 401,
        code: "authentication_failed",
      }
    );
  }

  if (!user?.id) {
    throw new CustomerActivationError(
      "Authentication is required.",
      {
        status: 401,
        code: "authentication_required",
      }
    );
  }

  const { error: ensureError } = await sessionClient.rpc(
    "ensure_access_context"
  );

  if (ensureError) {
    throwDatabaseError(
      "Unable to initialize access context",
      ensureError
    );
  }

  const { data, error: accessError } =
    await sessionClient.rpc("access_context");

  if (accessError) {
    throwDatabaseError(
      "Unable to resolve access context",
      accessError
    );
  }

  const access = data as AccessContext | null;

  if (!access?.is_platform_owner) {
    throw new CustomerActivationError(
      "Customer activation is restricted to Team Optix platform owners.",
      {
        status: 403,
        code: "platform_owner_required",
      }
    );
  }

  return {
    actorUserId: user.id,
    access,
    admin: createSupabaseServiceRoleClient(),
  };
}

async function resolveCompanyBySlug(
  admin: SupabaseClient,
  slug: string
): Promise<CompanyRecord> {
  const normalizedSlug = slug.trim();

  if (!normalizedSlug) {
    throw new CustomerActivationError(
      "Company slug is required.",
      {
        status: 400,
        code: "company_slug_required",
      }
    );
  }

  const { data, error } = await admin
    .from("companies")
    .select(
      "id, company_name, company_slug, company_status, created_at"
    )
    .eq("company_slug", normalizedSlug)
    .maybeSingle();

  if (error) {
    throwDatabaseError("Unable to resolve company", error);
  }

  if (!data) {
    throw new CustomerActivationError(
      "Company not found.",
      {
        status: 404,
        code: "company_not_found",
      }
    );
  }

  return data as CompanyRecord;
}

async function ensureActivationFoundation(
  admin: SupabaseClient,
  company: CompanyRecord
): Promise<void> {
  const { error: activationError } = await admin
    .schema("commercial")
    .from("company_activation")
    .upsert(
      {
        company_id: company.id,
        lifecycle_status: "implementation",
        implementation_started_at: company.created_at,
        last_transition: "service_initialization",
        last_transition_at: new Date().toISOString(),
      },
      {
        onConflict: "company_id",
        ignoreDuplicates: true,
      }
    );

  if (activationError) {
    throwDatabaseError(
      "Unable to initialize company activation",
      activationError
    );
  }

  const readinessRows = READINESS_DEFAULTS.map((item) => ({
    company_id: company.id,
    readiness_key: item.readiness_key,
    status: "incomplete",
    source_type: item.source_type,
    is_blocking: true,
    blocking_reason: item.blocking_reason,
  }));

  const { error: readinessError } = await admin
    .schema("commercial")
    .from("company_activation_readiness")
    .upsert(readinessRows, {
      onConflict: "company_id,readiness_key",
      ignoreDuplicates: true,
    });

  if (readinessError) {
    throwDatabaseError(
      "Unable to initialize activation readiness",
      readinessError
    );
  }
}

async function loadActivation(
  admin: SupabaseClient,
  companyId: string
): Promise<CompanyActivationRecord> {
  const { data, error } = await admin
    .schema("commercial")
    .from("company_activation")
    .select("*")
    .eq("company_id", companyId)
    .single();

  if (error || !data) {
    throwDatabaseError(
      "Unable to load company activation",
      error
    );
  }

  return data as CompanyActivationRecord;
}

async function loadReadiness(
  admin: SupabaseClient,
  companyId: string
): Promise<CompanyActivationReadinessRecord[]> {
  const { data, error } = await admin
    .schema("commercial")
    .from("company_activation_readiness")
    .select("*")
    .eq("company_id", companyId)
    .order("readiness_key", { ascending: true });

  if (error) {
    throwDatabaseError(
      "Unable to load activation readiness",
      error
    );
  }

  return (data ?? []) as CompanyActivationReadinessRecord[];
}

async function loadLatestRun(
  admin: SupabaseClient,
  companyId: string
): Promise<CompanyActivationRunRecord | null> {
  const { data, error } = await admin
    .schema("commercial")
    .from("company_activation_run")
    .select("*")
    .eq("company_id", companyId)
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throwDatabaseError(
      "Unable to load latest activation run",
      error
    );
  }

  return (data as CompanyActivationRunRecord | null) ?? null;
}

async function loadRunSteps(
  admin: SupabaseClient,
  activationRunId: string | null
): Promise<CompanyActivationStepRecord[]> {
  if (!activationRunId) {
    return [];
  }

  const { data, error } = await admin
    .schema("commercial")
    .from("company_activation_step")
    .select("*")
    .eq("activation_run_id", activationRunId)
    .order("step_order", { ascending: true });

  if (error) {
    throwDatabaseError(
      "Unable to load activation run steps",
      error
    );
  }

  return (data ?? []) as CompanyActivationStepRecord[];
}


async function syncComputedActivationReadiness(
  admin: SupabaseClient,
  companyId: string
): Promise<void> {
  const [
    { data: commercialProfile, error: commercialError },
    { data: implementationPayment, error: paymentError },
  ] = await Promise.all([
    admin
      .schema("commercial")
      .from("profile")
      .select(
        "operator_tier_key, implementation_fee, weekly_subscription, billing_email, commercial_status"
      )
      .eq("company_id", companyId)
      .maybeSingle(),

    admin
      .schema("billing")
      .from("payment")
      .select(
        "id, amount, currency, payment_status, paid_at, provider_event_id"
      )
      .eq("company_id", companyId)
      .eq("payment_purpose", "implementation")
      .eq("payment_status", "paid")
      .order("paid_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (commercialError) {
    throwDatabaseError(
      "Unable to compute commercial readiness",
      commercialError
    );
  }

  if (paymentError) {
    throwDatabaseError(
      "Unable to compute implementation payment readiness",
      paymentError
    );
  }

  const typedCommercialProfile =
    commercialProfile as CommercialReadinessProfile | null;

  const typedImplementationPayment =
    implementationPayment as ImplementationPaymentRecord | null;

  const commercialStages = new Set([
    "ready_for_stripe",
    "stripe_customer_created",
    "implementation_paid",
    "subscription_active",
  ]);

  const commercialReady = Boolean(
    typedCommercialProfile?.operator_tier_key &&
      typedCommercialProfile?.billing_email &&
      typedCommercialProfile?.implementation_fee != null &&
      typedCommercialProfile?.weekly_subscription != null &&
      commercialStages.has(
        String(typedCommercialProfile?.commercial_status ?? "")
      )
  );

  const commercialBlockingReason = !typedCommercialProfile
    ? "Commercial profile has not been created."
    : !typedCommercialProfile.operator_tier_key
      ? "Operator tier has not been assigned."
      : !typedCommercialProfile.billing_email
        ? "Billing email has not been recorded."
        : typedCommercialProfile.implementation_fee == null
          ? "Implementation fee has not been established."
          : typedCommercialProfile.weekly_subscription == null
            ? "Weekly subscription price has not been established."
            : !commercialStages.has(
                  String(typedCommercialProfile.commercial_status ?? "")
                )
              ? "Commercial profile has not reached a Go Live-ready stage."
              : null;

  const implementationPaymentReady =
    Boolean(typedImplementationPayment?.id);

  const now = new Date().toISOString();

  const computedRows = [
    {
      company_id: companyId,
      readiness_key: "commercial_ready",
      status: commercialReady ? "ready" : "incomplete",
      source_type: "computed",
      source_basis: commercialReady
        ? `Commercial profile verified at stage ${typedCommercialProfile?.commercial_status}.`
        : null,
      is_blocking: true,
      completed_at: commercialReady ? now : null,
      completed_by: null,
      blocking_reason: commercialReady
        ? null
        : commercialBlockingReason ??
          "Commercial profile is not ready for Go Live.",
      metadata: {
        commercial_status:
          typedCommercialProfile?.commercial_status ?? null,
        operator_tier_key:
          typedCommercialProfile?.operator_tier_key ?? null,
      },
    },
    {
      company_id: companyId,
      readiness_key: "implementation_payment_ready",
      status: implementationPaymentReady
        ? "ready"
        : "incomplete",
      source_type: "computed",
      source_basis: implementationPaymentReady
        ? "Verified from the latest paid implementation payment record."
        : null,
      is_blocking: true,
      completed_at:
        typedImplementationPayment?.paid_at ??
        (implementationPaymentReady ? now : null),
      completed_by: null,
      blocking_reason: implementationPaymentReady
        ? null
        : "A paid implementation payment record has not been found.",
      metadata: {
        payment_id: typedImplementationPayment?.id ?? null,
        provider_event_id:
          typedImplementationPayment?.provider_event_id ?? null,
        amount: typedImplementationPayment?.amount ?? null,
        currency: typedImplementationPayment?.currency ?? null,
      },
    },
  ];

  const { error: readinessError } = await admin
    .schema("commercial")
    .from("company_activation_readiness")
    .upsert(computedRows, {
      onConflict: "company_id,readiness_key",
    });

  if (readinessError) {
    throwDatabaseError(
      "Unable to persist computed activation readiness",
      readinessError
    );
  }

  const { error: activationError } = await admin
    .schema("commercial")
    .from("company_activation")
    .update({
      implementation_payment_received_at:
        typedImplementationPayment?.paid_at ?? null,
    })
    .eq("company_id", companyId);

  if (activationError) {
    throwDatabaseError(
      "Unable to synchronize implementation payment timestamp",
      activationError
    );
  }
}

async function reconcileActivationLifecycleFromReadiness(
  admin: SupabaseClient,
  companyId: string,
  actorUserId: string
): Promise<void> {
  const [activation, readiness] = await Promise.all([
    loadActivation(admin, companyId),
    loadReadiness(admin, companyId),
  ]);

  if (
    [
      "activation_in_progress",
      "active",
      "paused",
      "cancelled",
      "archived",
    ].includes(activation.lifecycle_status)
  ) {
    return;
  }

  const blockingReadiness = readiness.filter(
    (item) =>
      item.is_blocking &&
      item.status === "incomplete"
  );

  const nextLifecycleStatus: ActivationLifecycleStatus =
    blockingReadiness.length === 0
      ? "ready_for_go_live"
      : "implementation";

  if (activation.lifecycle_status === nextLifecycleStatus) {
    return;
  }

  const now = new Date().toISOString();

  const { error } = await admin
    .schema("commercial")
    .from("company_activation")
    .update({
      lifecycle_status: nextLifecycleStatus,
      ready_for_go_live_at:
        nextLifecycleStatus === "ready_for_go_live"
          ? now
          : null,
      ready_for_go_live_by:
        nextLifecycleStatus === "ready_for_go_live"
          ? actorUserId
          : null,
      last_transition:
        nextLifecycleStatus === "ready_for_go_live"
          ? "readiness_completed"
          : "readiness_reopened",
      last_transition_at: now,
      last_transition_by: actorUserId,
    })
    .eq("company_id", companyId);

  if (error) {
    throwDatabaseError(
      "Unable to reconcile activation lifecycle",
      error
    );
  }
}

export async function getCompanyActivationSnapshot(
  slug: string
): Promise<CompanyActivationSnapshot> {
  const { actorUserId, admin } =
    await requirePlatformOwner();

  const company = await resolveCompanyBySlug(admin, slug);

  await ensureActivationFoundation(admin, company);
  await syncComputedActivationReadiness(admin, company.id);
  await reconcileActivationLifecycleFromReadiness(
    admin,
    company.id,
    actorUserId
  );

  const [activation, readiness, latestRun] =
    await Promise.all([
      loadActivation(admin, company.id),
      loadReadiness(admin, company.id),
      loadLatestRun(admin, company.id),
    ]);

  const latestRunSteps = await loadRunSteps(
    admin,
    latestRun?.id ?? null
  );

  const blockingReadiness = readiness.filter(
    (item) =>
      item.is_blocking &&
      item.status === "incomplete"
  );

  return {
    company,
    activation,
    readiness,
    latest_run: latestRun,
    latest_run_steps: latestRunSteps,
    blocking_readiness: blockingReadiness,
    is_ready_for_go_live:
      readiness.length === READINESS_DEFAULTS.length &&
      blockingReadiness.length === 0,
  };
}

export async function getPlatformOwnerActivationContext(): Promise<{
  actor_user_id: string;
  profile_id: string | null;
}> {
  const { actorUserId, access } =
    await requirePlatformOwner();

  return {
    actor_user_id: actorUserId,
    profile_id: access.profile_id ?? null,
  };
}

export async function updateManualActivationReadiness(input: {
  slug: string;
  readiness_key: ActivationReadinessKey;
  status: ActivationReadinessStatus;
  source_basis?: string | null;
  blocking_reason?: string | null;
}): Promise<CompanyActivationSnapshot> {
  const { actorUserId, admin } = await requirePlatformOwner();
  const company = await resolveCompanyBySlug(admin, input.slug);

  await ensureActivationFoundation(admin, company);

  const { data: current, error: currentError } = await admin
    .schema("commercial")
    .from("company_activation_readiness")
    .select("*")
    .eq("company_id", company.id)
    .eq("readiness_key", input.readiness_key)
    .single();

  if (currentError || !current) {
    throwDatabaseError(
      "Unable to load readiness item",
      currentError
    );
  }

  const typedCurrent =
    current as CompanyActivationReadinessRecord;

  if (typedCurrent.source_type === "computed") {
    throw new CustomerActivationError(
      "Computed readiness items cannot be changed manually.",
      {
        status: 409,
        code: "computed_readiness_immutable",
      }
    );
  }

  const now = new Date().toISOString();

  const update =
    input.status === "ready"
      ? {
          status: "ready",
          source_basis:
            input.source_basis?.trim() || "Confirmed by Team Optix.",
          blocking_reason: null,
          completed_at: now,
          completed_by: actorUserId,
        }
      : input.status === "not_applicable"
        ? {
            status: "not_applicable",
            source_basis:
              input.source_basis?.trim() || "Marked not applicable.",
            blocking_reason: null,
            completed_at: null,
            completed_by: actorUserId,
          }
        : {
            status: "incomplete",
            source_basis: input.source_basis?.trim() || null,
            blocking_reason:
              input.blocking_reason?.trim() ||
              typedCurrent.blocking_reason ||
              "Readiness has not yet been completed.",
            completed_at: null,
            completed_by: null,
          };

  const { error: updateError } = await admin
    .schema("commercial")
    .from("company_activation_readiness")
    .update(update)
    .eq("company_id", company.id)
    .eq("readiness_key", input.readiness_key);

  if (updateError) {
    throwDatabaseError(
      "Unable to update readiness item",
      updateError
    );
  }

  const readiness = await loadReadiness(admin, company.id);
  const blockingReadiness = readiness.filter(
    (item) =>
      item.is_blocking &&
      item.status === "incomplete"
  );

  const { data: activation, error: activationError } =
    await admin
      .schema("commercial")
      .from("company_activation")
      .select("*")
      .eq("company_id", company.id)
      .single();

  if (activationError || !activation) {
    throwDatabaseError(
      "Unable to load company activation",
      activationError
    );
  }

  const nextLifecycleStatus =
    blockingReadiness.length === 0
      ? "ready_for_go_live"
      : "implementation";

  const lifecycleChanged =
    activation.lifecycle_status !== nextLifecycleStatus;

  if (lifecycleChanged) {
    const { error: lifecycleError } = await admin
      .schema("commercial")
      .from("company_activation")
      .update({
        lifecycle_status: nextLifecycleStatus,
        ready_for_go_live_at:
          nextLifecycleStatus === "ready_for_go_live"
            ? now
            : null,
        ready_for_go_live_by:
          nextLifecycleStatus === "ready_for_go_live"
            ? actorUserId
            : null,
        last_transition:
          nextLifecycleStatus === "ready_for_go_live"
            ? "readiness_completed"
            : "readiness_reopened",
        last_transition_at: now,
        last_transition_by: actorUserId,
      })
      .eq("company_id", company.id);

    if (lifecycleError) {
      throwDatabaseError(
        "Unable to update lifecycle readiness state",
        lifecycleError
      );
    }
  }

  return getCompanyActivationSnapshot(input.slug);
}
