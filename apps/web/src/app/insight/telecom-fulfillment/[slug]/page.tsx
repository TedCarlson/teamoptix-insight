import { notFound } from "next/navigation";
import { resolveItfWorkspaceContext } from "@/features/insight-telecom/access/itfWorkspaceContext.server";
import ItfCompanyHome from "@/features/insight-telecom/components/ItfCompanyHome";
import { loadItfCompanyRoster } from "@/features/insight-telecom/roster/itfRoster.server";

export default async function TelecomFulfillmentHome(props: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await props.params;
  const context = await resolveItfWorkspaceContext(slug);

  if (!context?.can_enter) notFound();

  const roster = await loadItfCompanyRoster(context.company_slug);

  return <ItfCompanyHome context={context} roster={roster} />;
}
