import { redirect } from "next/navigation";
import { hasCompanyWorkspaceAccess } from "@/features/company/config/companyWorkspaceAccess.server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export default async function FleetLayout(props: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await props.params;
  const supabase = await getSupabaseServerClient();

  if (!(await hasCompanyWorkspaceAccess(supabase, slug, "fleet"))) {
    redirect(`/company/${slug}/announcements`);
  }

  return props.children;
}
