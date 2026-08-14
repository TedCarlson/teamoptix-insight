import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { executeActivationRun } from "@/features/teamoptix/customer-activation/executor/activationExecutor";
import { initialActivationSteps } from "@/features/teamoptix/customer-activation/executor/defaultActivationSteps";
import { liveBillingRecoveryStepKeys } from "@/features/teamoptix/customer-activation/lib/activationRecovery";
import { calculateFirstFridayAfterGoLive } from "@/features/teamoptix/customer-activation/lib/billingCalendar";

export { calculateFirstFridayAfterGoLive };

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
  | "legal_signatures_ready"
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
  provider_invoice_id: string | null;
  provider_livemode: boolean | null;
};

type ActiveContractRecord = {
  id: string;
  company_id: string;
  contract_number: string;
  terminal_identity: string;
  service_area: string;
};

type LegalTaskReadinessRecord = {
  id: string;
  status: string | null;
  vault_item_id: string | null;
  teamoptix_executed_at: string | null;
  completed_at: string | null;
  source_template_document_key: string | null;
};

type AutomationProfileRecord = {
  id: string;
  company_id: string;
  provider_key: string;
  status:
    | "NOT_CONFIGURED"
    | "CONFIGURED"
    | "HEALTHY"
    | "WARNING"
    | "ACTION_REQUIRED"
    | "DISABLED";
  created_at: string;
  updated_at: string;
};

type AutomationCredentialReadinessRecord = {
  username: string;
  has_secret: boolean;
  last_verified_at: string | null;
  last_verification_result: string | null;
  updated_at: string;
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
    source_type: "computed",
    blocking_reason:
      "An active contract configuration has not yet been established.",
  },
  {
    readiness_key: "legal_signatures_ready",
    source_type: "computed",
    blocking_reason:
      "Required customer legal documents have not yet been executed and vaulted.",
  },
  {
    readiness_key: "workspace_ready",
    source_type: "manual",
    blocking_reason:
      "Workspace readiness has not yet been acknowledged.",
  },
  {
    readiness_key: "credentials_ready",
    source_type: "computed",
    blocking_reason:
      "Customer-managed FedEx credentials have not yet been verified.",
  },
  {
    readiness_key: "automation_ready",
    source_type: "computed",
    blocking_reason:
      "Contract governance and collection access are not yet operational.",
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
      "Customer-provided authorization to Go Live has not yet been recorded by Team Optix.",
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
  companyId: string,
  companySlug: string
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);

  const [
    { data: commercialProfile, error: commercialError },
    { data: implementationPayment, error: paymentError },
    { data: activeContract, error: contractError },
    { data: legalTasks, error: legalTasksError },
    { data: automationProfile, error: automationProfileError },
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
        "id, amount, currency, payment_status, paid_at, provider_event_id, provider_invoice_id, provider_livemode"
      )
      .eq("company_id", companyId)
      .eq("payment_purpose", "implementation")
      .eq("payment_status", "paid")
      .eq("provider_livemode", true)
      .order("paid_at", { ascending: false })
      .limit(1)
      .maybeSingle(),

    admin.rpc("get_active_company_contract_config", {
      p_company_slug: companySlug,
      p_service_date: today,
    }),

    admin
      .from("legal_customer_legal_task_v")
      .select("id, status, vault_item_id, teamoptix_executed_at, completed_at, source_template_document_key")
      .eq("company_id", companyId),

    admin.rpc("get_or_create_automation_profile", {
      p_company_id: companyId,
      p_provider_key: "FEDEX",
    }),
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

  if (contractError) {
    throwDatabaseError(
      "Unable to compute contract readiness",
      contractError
    );
  }

  if (legalTasksError) {
    throwDatabaseError(
      "Unable to compute legal readiness",
      legalTasksError
    );
  }

  if (automationProfileError) {
    throwDatabaseError(
      "Unable to compute automation readiness",
      automationProfileError
    );
  }

  const typedCommercialProfile =
    commercialProfile as CommercialReadinessProfile | null;

  const typedImplementationPayment =
    implementationPayment as ImplementationPaymentRecord | null;

  const activeContractRow = Array.isArray(activeContract)
    ? activeContract[0] ?? null
    : activeContract;

  const typedActiveContract =
    activeContractRow as ActiveContractRecord | null;

  const typedLegalTasks =
    (legalTasks ?? []) as unknown as LegalTaskReadinessRecord[];

  const openLegalTasks = typedLegalTasks.filter((task) =>
    task.status !== "EXECUTED_AND_VAULTED" && task.status !== "CANCELLED"
  );

  const executedLegalTasks = typedLegalTasks.filter((task) =>
    task.status === "EXECUTED_AND_VAULTED"
  );

  const requiredLegalDocumentKeys = [
    "MASTER_SERVICE_AGREEMENT",
    "STATEMENT_OF_WORK",
    "DATA_PROCESSING_ADDENDUM",
    "ACCEPTABLE_USE_POLICY",
  ];

  const executedLegalDocumentKeys = new Set(
    executedLegalTasks
      .filter((task) => task.vault_item_id)
      .map((task) => task.source_template_document_key)
      .filter((key): key is string => Boolean(key))
  );

  const missingLegalDocumentKeys = requiredLegalDocumentKeys.filter(
    (key) => !executedLegalDocumentKeys.has(key)
  );

  const legalSignaturesReady = missingLegalDocumentKeys.length === 0;

  const latestLegalCompletion = executedLegalTasks
    .map((task) => task.completed_at ?? task.teamoptix_executed_at)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;

  const automationProfileRow = Array.isArray(
    automationProfile
  )
    ? automationProfile[0] ?? null
    : automationProfile;

  const typedAutomationProfile =
    automationProfileRow as AutomationProfileRecord | null;

  let typedCredential:
    | AutomationCredentialReadinessRecord
    | null = null;

  if (typedAutomationProfile?.id) {
    const { data: credentialData, error: credentialError } =
      await admin.rpc("get_automation_credential", {
        p_profile_id: typedAutomationProfile.id,
      });

    if (credentialError) {
      throwDatabaseError(
        "Unable to compute credential readiness",
        credentialError
      );
    }

    const credentialRow = Array.isArray(credentialData)
      ? credentialData[0] ?? null
      : credentialData;

    typedCredential =
      credentialRow as AutomationCredentialReadinessRecord | null;
  }

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

  const activeContractReady = Boolean(
    typedActiveContract?.id &&
      typedActiveContract.contract_number.trim() &&
      typedActiveContract.terminal_identity.trim() &&
      typedActiveContract.service_area.trim()
  );

  const contractReady = activeContractReady;

  const contractBlockingReason = !activeContractReady
    ? "An active contract row with contract number, terminal identity, and service area is required."
    : null;

  const legalSignaturesBlockingReason = legalSignaturesReady
    ? null
    : openLegalTasks.some((task) => task.status === "READY_FOR_CUSTOMER_REVIEW")
      ? "Customer legal review and signatures are still required."
      : openLegalTasks.some((task) => task.status === "CUSTOMER_ACCEPTED")
        ? "Team Optix final execution and vaulting is still required."
        : `Required legal documents must be issued, signed, and vaulted: ${missingLegalDocumentKeys.join(", ")}.`;

  const credentialsReady = Boolean(
    typedCredential?.has_secret &&
      typedCredential.last_verified_at &&
      typedAutomationProfile?.status === "HEALTHY"
  );

  const automationReady = Boolean(
    contractReady &&
      credentialsReady &&
      typedAutomationProfile?.status === "HEALTHY"
  );

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
        provider_invoice_id:
          typedImplementationPayment?.provider_invoice_id ?? null,
        provider_livemode:
          typedImplementationPayment?.provider_livemode ?? null,
        amount: typedImplementationPayment?.amount ?? null,
        currency: typedImplementationPayment?.currency ?? null,
      },
    },
    {
      company_id: companyId,
      readiness_key: "contract_ready",
      status: contractReady ? "ready" : "incomplete",
      source_type: "computed",
      source_basis: contractReady
        ? "Verified from the active Team Optix contract configuration."
        : null,
      is_blocking: true,
      completed_at: contractReady ? now : null,
      completed_by: null,
      blocking_reason: contractReady ? null : contractBlockingReason,
      metadata: {
        contract_config_id: typedActiveContract?.id ?? null,
        contract_number:
          typedActiveContract?.contract_number ?? null,
        terminal_identity:
          typedActiveContract?.terminal_identity ?? null,
        service_area:
          typedActiveContract?.service_area ?? null,
      },
    },
    {
      company_id: companyId,
      readiness_key: "legal_signatures_ready",
      status: legalSignaturesReady ? "ready" : "incomplete",
      source_type: "computed",
      source_basis: legalSignaturesReady
        ? "All required customer legal documents are executed and vaulted."
        : null,
      is_blocking: true,
      completed_at: legalSignaturesReady ? latestLegalCompletion ?? now : null,
      completed_by: null,
      blocking_reason: legalSignaturesBlockingReason,
      metadata: {
        required_document_keys: requiredLegalDocumentKeys,
        executed_document_keys: Array.from(executedLegalDocumentKeys),
        missing_document_keys: missingLegalDocumentKeys,
        legal_task_count: typedLegalTasks.length,
        open_legal_task_count: openLegalTasks.length,
        executed_legal_task_count: executedLegalTasks.length,
        latest_legal_completion_at: latestLegalCompletion,
      },
    },
    {
      company_id: companyId,
      readiness_key: "credentials_ready",
      status: credentialsReady ? "ready" : "incomplete",
      source_type: "computed",
      source_basis: credentialsReady
        ? "Customer-managed FedEx credentials are present and successfully verified."
        : null,
      is_blocking: true,
      completed_at: credentialsReady
        ? typedCredential?.last_verified_at ?? now
        : null,
      completed_by: null,
      blocking_reason: credentialsReady
        ? null
        : !typedAutomationProfile
          ? "A FedEx automation profile has not been initialized."
          : !typedCredential?.has_secret
            ? "The customer has not uploaded FedEx credentials."
            : !typedCredential.last_verified_at
              ? "The customer credentials have not been verified."
              : typedAutomationProfile.status !== "HEALTHY"
                ? "The most recent FedEx credential verification is not healthy."
                : "Customer-managed FedEx credentials are not ready.",
      metadata: {
        automation_profile_id:
          typedAutomationProfile?.id ?? null,
        automation_profile_status:
          typedAutomationProfile?.status ?? null,
        has_secret:
          typedCredential?.has_secret ?? false,
        last_verified_at:
          typedCredential?.last_verified_at ?? null,
        last_verification_result:
          typedCredential?.last_verification_result ?? null,
      },
    },
    {
      company_id: companyId,
      readiness_key: "automation_ready",
      status: automationReady ? "ready" : "incomplete",
      source_type: "computed",
      source_basis: automationReady
        ? "Active contract governance and healthy FedEx collection access are both confirmed."
        : null,
      is_blocking: true,
      completed_at: automationReady
        ? typedCredential?.last_verified_at ?? now
        : null,
      completed_by: null,
      blocking_reason: automationReady
        ? null
        : !contractReady
          ? "Automation is blocked until Team Optix establishes the active contract, terminal, and service-area mapping."
          : !credentialsReady
            ? "Automation is blocked until customer-managed FedEx credentials are successfully verified."
            : "Automation is not operationally ready.",
      metadata: {
        contract_ready: contractReady,
        credentials_ready: credentialsReady,
        automation_profile_id:
          typedAutomationProfile?.id ?? null,
        automation_profile_status:
          typedAutomationProfile?.status ?? null,
        contract_config_id:
          typedActiveContract?.id ?? null,
        last_verified_at:
          typedCredential?.last_verified_at ?? null,
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
  await syncComputedActivationReadiness(
    admin,
    company.id,
    company.company_slug
  );
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


const GO_LIVE_STEP_DEFINITIONS = [
  {
    step_key: "validate_readiness",
    step_order: 1,
  },
  {
    step_key: "record_go_live_decision",
    step_order: 2,
  },
  {
    step_key: "calculate_first_billing_date",
    step_order: 3,
  },
  {
    step_key: "create_stripe_subscription",
    step_order: 4,
  },
  {
    step_key: "persist_billing_subscription",
    step_order: 5,
  },
  {
    step_key: "enable_automation",
    step_order: 6,
  },
  {
    step_key: "confirm_intelligence_access",
    step_order: 7,
  },
  {
    step_key: "enable_notifications",
    step_order: 8,
  },
  {
    step_key: "finalize_activation",
    step_order: 9,
  },
] as const;

async function reopenRecoverableLiveBillingSteps(input: {
  admin: SupabaseClient;
  activation: CompanyActivationRecord;
  activationRunId: string;
  companyId: string;
  requestedAt: string;
}) {
  const { data: subscription, error: subscriptionError } = await input.admin
    .schema("billing")
    .from("subscription")
    .select("provider_subscription_id")
    .eq("company_id", input.companyId)
    .eq("provider", "stripe")
    .in("subscription_status", ["active", "trialing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ provider_subscription_id: string | null }>();

  if (subscriptionError) {
    throwDatabaseError(
      "Unable to inspect persisted Stripe subscription",
      subscriptionError
    );
  }

  const recoveryStepKeys = liveBillingRecoveryStepKeys({
    providerSubscriptionId: subscription?.provider_subscription_id ?? null,
    subscriptionActivationStatus:
      input.activation.subscription_activation_status,
    lifecycleStatus: input.activation.lifecycle_status,
  });

  if (recoveryStepKeys.length === 0) return;

  const { data: reopenedSteps, error: reopenError } = await input.admin
    .schema("commercial")
    .from("company_activation_step")
    .update({
      status: "pending",
      started_at: null,
      completed_at: null,
      last_error: null,
      result_metadata: {
        recovery_reason:
          "Reopened because Insight does not have a completed live Stripe subscription state.",
        recovery_requested_at: input.requestedAt,
      },
    })
    .eq("activation_run_id", input.activationRunId)
    .in("step_key", recoveryStepKeys)
    .in("status", ["complete", "skipped"])
    .select("id");

  if (reopenError) {
    throwDatabaseError(
      "Unable to reopen stale live billing activation steps",
      reopenError
    );
  }

  if ((reopenedSteps?.length ?? 0) === 0) return;

  const { error: runError } = await input.admin
    .schema("commercial")
    .from("company_activation_run")
    .update({
      status: "pending",
      completed_at: null,
      failure_summary: null,
    })
    .eq("id", input.activationRunId);

  if (runError) {
    throwDatabaseError(
      "Unable to reopen the live billing activation run",
      runError
    );
  }
}

export async function beginCompanyGoLive(
  slug: string
): Promise<CompanyActivationSnapshot> {
  const { actorUserId, admin } =
    await requirePlatformOwner();

  const company = await resolveCompanyBySlug(admin, slug);

  await ensureActivationFoundation(admin, company);
  await syncComputedActivationReadiness(
    admin,
    company.id,
    company.company_slug
  );
  await reconcileActivationLifecycleFromReadiness(
    admin,
    company.id,
    actorUserId
  );

  const [activation, readiness] = await Promise.all([
    loadActivation(admin, company.id),
    loadReadiness(admin, company.id),
  ]);

  const blockingReadiness = readiness.filter(
    (item) =>
      item.is_blocking &&
      item.status === "incomplete"
  );

  if (blockingReadiness.length > 0) {
    throw new CustomerActivationError(
      `Go Live is blocked by ${blockingReadiness.length} incomplete readiness item${
        blockingReadiness.length === 1 ? "" : "s"
      }.`,
      {
        status: 409,
        code: "go_live_readiness_blocked",
      }
    );
  }

  if (activation.lifecycle_status === "active") {
    throw new CustomerActivationError(
      "This customer is already active.",
      {
        status: 409,
        code: "customer_already_active",
      }
    );
  }

  if (
    activation.lifecycle_status === "paused" ||
    activation.lifecycle_status === "cancelled" ||
    activation.lifecycle_status === "archived"
  ) {
    throw new CustomerActivationError(
      `Go Live cannot begin from lifecycle state ${activation.lifecycle_status}.`,
      {
        status: 409,
        code: "invalid_go_live_lifecycle_state",
      }
    );
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const firstBillingDate =
    calculateFirstFridayAfterGoLive(now);

  const idempotencyKey =
    `company:${company.id}:initial-go-live:v1`;

  const { data: existingRun, error: existingRunError } =
    await admin
      .schema("commercial")
      .from("company_activation_run")
      .select("*")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();

  if (existingRunError) {
    throwDatabaseError(
      "Unable to inspect existing Go Live run",
      existingRunError
    );
  }

  let activationRunId =
    (existingRun as CompanyActivationRunRecord | null)?.id ??
    null;

  if (!activationRunId) {
    const { data: insertedRun, error: runError } =
      await admin
        .schema("commercial")
        .from("company_activation_run")
        .insert({
          company_id: company.id,
          run_type: "go_live",
          status: "pending",
          requested_at: nowIso,
          requested_by: actorUserId,
          idempotency_key: idempotencyKey,
        })
        .select("*")
        .single();

    if (runError || !insertedRun) {
      throwDatabaseError(
        "Unable to create Go Live activation run",
        runError
      );
    }

    activationRunId =
      (insertedRun as CompanyActivationRunRecord).id;
  }

  const stepRows = GO_LIVE_STEP_DEFINITIONS.map((step) => ({
    activation_run_id: activationRunId,
    step_key: step.step_key,
    step_order: step.step_order,
    status: "pending",
    attempt_count: 0,
  }));

  const { error: stepError } = await admin
    .schema("commercial")
    .from("company_activation_step")
    .upsert(stepRows, {
      onConflict: "activation_run_id,step_key",
      ignoreDuplicates: true,
    });

  if (stepError) {
    throwDatabaseError(
      "Unable to initialize Go Live activation steps",
      stepError
    );
  }

  await reopenRecoverableLiveBillingSteps({
    admin,
    activation,
    activationRunId,
    companyId: company.id,
    requestedAt: nowIso,
  });

  const { error: activationError } = await admin
    .schema("commercial")
    .from("company_activation")
    .update({
      lifecycle_status: "activation_in_progress",
      go_live_requested_at:
        activation.go_live_requested_at ?? nowIso,
      go_live_requested_by: actorUserId,
      first_billing_date:
        activation.first_billing_date ?? firstBillingDate,
      subscription_activation_status: "pending",
      last_transition: "go_live_requested",
      last_transition_at: nowIso,
      last_transition_by: actorUserId,
    })
    .eq("company_id", company.id);

  if (activationError) {
    throwDatabaseError(
      "Unable to record Go Live request",
      activationError
    );
  }

  const { data: runData, error: runLoadError } = await admin
    .schema("commercial")
    .from("company_activation_run")
    .select("*")
    .eq("id", activationRunId)
    .single();

  if (runLoadError || !runData) {
    throwDatabaseError(
      "Unable to load Go Live activation run",
      runLoadError
    );
  }

  const { data: stepData, error: stepLoadError } = await admin
    .schema("commercial")
    .from("company_activation_step")
    .select("*")
    .eq("activation_run_id", activationRunId)
    .order("step_order", { ascending: true });

  if (stepLoadError) {
    throwDatabaseError(
      "Unable to load Go Live activation steps",
      stepLoadError
    );
  }

  await executeActivationRun(
    {
      admin,
      actor_user_id: actorUserId,
      company_id: company.id,
      company_slug: company.company_slug,
      run: runData as CompanyActivationRunRecord,
      steps: (stepData ?? []) as CompanyActivationStepRecord[],
    },
    initialActivationSteps
  );

  return getCompanyActivationSnapshot(slug);
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
            input.source_basis?.trim() ||
            (input.readiness_key === "customer_approval_ready"
              ? "Customer-provided Go Live authorization recorded by Team Optix."
              : "Confirmed by Team Optix."),
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
