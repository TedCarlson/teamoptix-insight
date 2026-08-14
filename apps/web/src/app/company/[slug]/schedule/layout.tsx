import { redirect } from "next/navigation";
import { hasCompanyWorkspaceAccess } from "@/features/company/config/companyWorkspaceAccess.server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export default async function ScheduleLayout(props: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await props.params;
  const supabase = await getSupabaseServerClient();

  if (!(await hasCompanyWorkspaceAccess(supabase, slug, "schedule"))) {
    redirect(`/company/${slug}/driver/schedule`);
  }

  return <div className="schedule-theme-scope">{props.children}</div>;
}
