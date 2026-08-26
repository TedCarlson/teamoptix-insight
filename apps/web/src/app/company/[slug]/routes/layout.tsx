import { redirect } from "next/navigation";
import { hasCompanyWorkspaceAccess } from "@/features/company/config/companyWorkspaceAccess.server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export default async function RoutesLayout(props: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const supabase = await getSupabaseServerClient();
  if (!(await hasCompanyWorkspaceAccess(supabase, slug, "routes"))) redirect(`/company/${slug}/workspace`);
  return <div className="routes-theme-scope">{props.children}</div>;
}
