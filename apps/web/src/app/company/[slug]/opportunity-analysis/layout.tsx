import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export default async function OpportunityAnalysisLayout(props: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await props.params;
  const supabase = await getSupabaseServerClient();
  const { data: access } = await supabase.rpc("access_context");
  const membership = Array.isArray(access?.memberships)
    ? access.memberships.find((item: Record<string, unknown>) => item.company_slug === slug)
    : null;
  const grants = Array.isArray(membership?.grants) ? membership.grants : [];
  const allowed =
    Boolean(access?.is_platform_owner) ||
    (membership?.membership_status === "active" &&
      (membership?.relationship_type === "admin" || grants.includes("opportunity_analysis")));

  if (!allowed) redirect(`/company/${slug}/announcements`);

  return props.children;
}
