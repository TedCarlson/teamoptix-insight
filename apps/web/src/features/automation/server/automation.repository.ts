import { getSupabaseServerClient } from "@/lib/supabase/server";

export type SupabaseServerClient = Awaited<ReturnType<typeof getSupabaseServerClient>>;

export type AutomationProfileStatus =
  | "NOT_CONFIGURED"
  | "CONFIGURED"
  | "HEALTHY"
  | "WARNING"
  | "ACTION_REQUIRED"
  | "DISABLED";

export type AutomationProfile = {
  id: string;
  company_id: string;
  provider_key: "FEDEX";
  status: AutomationProfileStatus;
  created_at: string;
  updated_at: string;
};

type AutomationAccessContext = {
  is_platform_owner?: boolean;
  memberships?: Array<{
    company_slug?: string;
    membership_status?: string;
    relationship_type?: string;
  }>;
};

export async function resolveAutomationAccess(
  supabase: SupabaseServerClient,
  slug: string
) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      allowed: false,
      canAdmin: false,
      isPlatformOwner: false,
      error: "Unauthorized.",
      status: 401,
    };
  }

  const { data, error } = await supabase.rpc("access_context");

  if (error) {
    return {
      allowed: false,
      canAdmin: false,
      isPlatformOwner: false,
      error: error.message,
      status: 500,
    };
  }

  const access = data as AutomationAccessContext | null;
  const isPlatformOwner = Boolean(access?.is_platform_owner);
  const membership = access?.memberships?.find(
    (item) =>
      item.company_slug === slug &&
      item.membership_status === "active"
  );
  const allowed = isPlatformOwner || Boolean(membership);
  const canAdmin =
    isPlatformOwner || membership?.relationship_type === "admin";

  return {
    allowed,
    canAdmin,
    isPlatformOwner,
    error: allowed ? null : "Forbidden.",
    status: allowed ? 200 : 403,
  };
}

export async function resolveCompanyBySlug(
  supabase: SupabaseServerClient,
  slug: string
) {
  const { data: company, error } = await supabase
    .from("companies")
    .select("id, company_slug")
    .eq("company_slug", slug)
    .single();

  if (error || !company) {
    return { company: null, error: "Company not found." };
  }

  return { company, error: null };
}

export async function getOrCreateFedExAutomationProfile(
  supabase: SupabaseServerClient,
  companyId: string
) {
  const { data, error } = await supabase.rpc("get_or_create_automation_profile", {
    p_company_id: companyId,
    p_provider_key: "FEDEX",
  });

  if (error) {
    return { profile: null, error: error.message };
  }

  if (!data) {
    return { profile: null, error: "Failed to load automation profile." };
  }

  return { profile: data as AutomationProfile, error: null };
}


export async function getAutomationCredential(
  supabase: SupabaseServerClient,
  profileId: string
) {
  const { data, error } = await supabase.rpc(
    "get_automation_credential",
    {
      p_profile_id: profileId,
    }
  );

  if (error) {
    return { row: null, error: error.message };
  }

  const row = Array.isArray(data) ? data[0] ?? null : data;

  return { row, error: null };
}

export async function saveAutomationCredential(
  supabase: SupabaseServerClient,
  profileId: string,
  username: string,
  password: string
) {
  const { error } = await supabase.rpc(
    "save_automation_credential",
    {
      p_profile_id: profileId,
      p_username: username,
      p_password: password,
    }
  );

  if (error) {
    return { row: null, error: error.message };
  }

  return { row: true, error: null };
}


export async function getAutomationCredentialForVerify(
  supabase: SupabaseServerClient,
  profileId: string
) {
  const { data, error } = await supabase.rpc(
    "get_automation_credential_for_verify",
    { p_profile_id: profileId }
  );

  if (error) return { row: null, error: error.message };

  const row = Array.isArray(data) ? data[0] ?? null : data;

  if (!row) return { row: null, error: "No credential saved." };

  return { row, error: null };
}

export async function recordAutomationCredentialVerification(
  supabase: SupabaseServerClient,
  profileId: string,
  result: string,
  status: "HEALTHY" | "ACTION_REQUIRED" | "WARNING"
) {
  const { error } = await supabase.rpc(
    "record_automation_credential_verification",
    {
      p_profile_id: profileId,
      p_result: result,
      p_status: status,
    }
  );

  if (error) return { ok: false, error: error.message };

  return { ok: true, error: null };
}
