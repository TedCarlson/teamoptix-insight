import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { canAccessCompanyWorkspace } from "@/features/company/config/companyWorkspaceAccess";

export async function getDispatchRequestContext(slug: string) {
  const supabase = await getSupabaseServerClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return {
      error: NextResponse.json({ error: "Unauthorized." }, { status: 401 }),
    };
  }

  const { data: access, error: accessError } = await supabase.rpc("access_context");

  if (accessError) {
    return {
      error: NextResponse.json({ error: "Unable to verify workspace access." }, { status: 503 }),
    };
  }

  if (!canAccessCompanyWorkspace(access, slug, "dispatch")) {
    return {
      error: NextResponse.json({ error: "Dispatch access is required." }, { status: 403 }),
    };
  }

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id, company_slug")
    .eq("company_slug", slug)
    .single();

  if (companyError || !company) {
    return {
      error: NextResponse.json({ error: "Company not found." }, { status: 404 }),
    };
  }

  return {
    supabase,
    company,
    access,
  };
}
