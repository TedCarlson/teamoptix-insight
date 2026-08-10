import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CompanyWorkspaceGrantKey } from "./companyAccessModel";
import { canAccessCompanyWorkspace } from "./companyWorkspaceAccess";

export async function hasCompanyWorkspaceAccess(
  supabase: SupabaseClient,
  companySlug: string,
  grantKey: CompanyWorkspaceGrantKey
): Promise<boolean> {
  const { data: access, error } = await supabase.rpc("access_context");

  if (error) {
    throw new Error(`Unable to verify workspace access: ${error.message}`);
  }

  return canAccessCompanyWorkspace(access, companySlug, grantKey);
}
