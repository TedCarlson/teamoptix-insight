import { redirect } from "next/navigation";
import { canAccessCompanyWorkspace } from "@/features/company/config/companyWorkspaceAccess";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export default async function CompanyConfigLayout(props: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await props.params;
  const supabase = await getSupabaseServerClient();
  const { data: accessContext, error } = await supabase.rpc("access_context");

  if (error) {
    throw new Error(`Unable to verify company configuration access: ${error.message}`);
  }

  const allowed =
    canAccessCompanyWorkspace(accessContext, slug, "admin_config") ||
    canAccessCompanyWorkspace(accessContext, slug, "grant_management");

  if (!allowed) redirect(`/company/${slug}/workspace`);

  return props.children;
}
