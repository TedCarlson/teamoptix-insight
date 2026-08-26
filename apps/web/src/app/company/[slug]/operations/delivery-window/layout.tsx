import { redirect } from "next/navigation";
import { hasCompanyWorkspaceAccess } from "@/features/company/config/companyWorkspaceAccess.server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export default async function DeliveryWindowLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await getSupabaseServerClient();
  if (!(await hasCompanyWorkspaceAccess(supabase, slug, "delivery_window"))) redirect(`/company/${slug}/workspace`);
  return children;
}
