import "server-only";

import { redirect } from "next/navigation";
import type { CompanyWorkspaceGrantKey } from "@/features/company/config/companyAccessModel";
import { hasCompanyWorkspaceAccess } from "@/features/company/config/companyWorkspaceAccess.server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export default async function CompanyWorkspaceGrantBoundary({ children, slug, grant }: { children: React.ReactNode; slug: string; grant: CompanyWorkspaceGrantKey }) {
  const supabase = await getSupabaseServerClient();
  if (!(await hasCompanyWorkspaceAccess(supabase, slug, grant))) redirect(`/company/${slug}/workspace`);
  return children;
}
