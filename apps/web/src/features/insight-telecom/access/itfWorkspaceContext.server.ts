import "server-only";

import { cache } from "react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  buildItfFoundationPreview,
  isItfWorkspaceContext,
  type ItfFallbackAccess,
  type ItfWorkspaceContext,
} from "./itfWorkspaceContext";

function isMissingResolver(error: { code?: string; message?: string } | null) {
  return Boolean(
    error &&
      (error.code === "PGRST202" ||
        error.message?.includes("itf_workspace_context"))
  );
}

export const resolveItfWorkspaceContext = cache(async function resolveItfWorkspaceContext(
  companySlug: string
): Promise<ItfWorkspaceContext | null> {
  const supabase = await getSupabaseServerClient();
  const { data: userResult, error: userError } = await supabase.auth.getUser();

  if (userError || !userResult.user) return null;

  const { data, error } = await supabase.rpc("itf_workspace_context", {
    p_company_slug: companySlug,
  });

  if (!error) return isItfWorkspaceContext(data) ? data : null;
  if (!isMissingResolver(error)) {
    throw new Error(`Unable to resolve ITF workspace access: ${error.message}`);
  }

  // Temporary local-branch bridge while Event 2 remains unapplied. It still
  // requires a fresh authenticated user plus an existing company access path.
  const [accessResult, companyResult] = await Promise.all([
    supabase.rpc("access_context"),
    supabase
      .from("companies")
      .select("id, company_name, company_slug, company_status")
      .eq("company_slug", companySlug)
      .eq("company_status", "active")
      .maybeSingle(),
  ]);

  if (accessResult.error || companyResult.error || !companyResult.data) {
    return null;
  }

  return buildItfFoundationPreview(
    accessResult.data as ItfFallbackAccess,
    companyResult.data
  );
});
