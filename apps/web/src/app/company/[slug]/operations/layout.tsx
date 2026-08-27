import OperationsWorkspace from "@/features/operations/workspace/OperationsWorkspace";
import { canAccessCompanyWorkspace } from "@/features/company/config/companyWorkspaceAccess";
import type { PersistentOperationsAccess } from "@/features/operations/workspace/operationsWorkspaceRoute";
import { getSupabaseServerClient } from "@/lib/supabase/server";

function todayEasternIso() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export default async function OperationsLayout(props: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { children, params } = props;
  const { slug } = await params;
  const supabase = await getSupabaseServerClient();
  const { data: accessContext, error } = await supabase.rpc("access_context");

  if (error) {
    throw new Error(`Unable to verify operations access: ${error.message}`);
  }

  const access: PersistentOperationsAccess = {
    operations: canAccessCompanyWorkspace(
      accessContext,
      slug,
      "operations_uploads"
    ),
    dispatch: canAccessCompanyWorkspace(accessContext, slug, "dispatch"),
    service: canAccessCompanyWorkspace(
      accessContext,
      slug,
      "delivery_window"
    ),
    planning: canAccessCompanyWorkspace(accessContext, slug, "planning"),
  };

  return (
    <OperationsWorkspace
      access={access}
      slug={slug}
      serviceDate={todayEasternIso()}
    >
      {children}
    </OperationsWorkspace>
  );
}
