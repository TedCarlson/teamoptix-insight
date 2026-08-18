import { notFound } from "next/navigation";
import { resolveItfWorkspaceContext } from "@/features/insight-telecom/access/itfWorkspaceContext.server";
import ItfRosterWorkspace from "@/features/insight-telecom/components/ItfRosterWorkspace";
import {
  loadItfCompanyOffices,
  loadItfCompanyRegions,
  loadItfCompanyRoster,
  loadItfCompanyWorkforceUnits,
  loadItfRosterRelationshipContext,
} from "@/features/insight-telecom/roster/itfRoster.server";

export default async function TelecomFulfillmentRoster(props: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await props.params;
  const context = await resolveItfWorkspaceContext(slug);

  if (!context?.can_enter) notFound();

  const [roster, offices, workforceUnits, regions, relationshipOptions] = await Promise.all([
    loadItfCompanyRoster(context.company_slug),
    loadItfCompanyOffices(context.company_slug),
    loadItfCompanyWorkforceUnits(context.company_slug),
    loadItfCompanyRegions(context.company_slug),
    loadItfRosterRelationshipContext(context.company_slug),
  ]);

  return (
    <ItfRosterWorkspace
      context={context}
      initialRows={roster}
      initialOffices={offices}
      initialWorkforceUnits={workforceUnits}
      initialRegions={regions}
      relationshipOptions={relationshipOptions}
    />
  );
}
