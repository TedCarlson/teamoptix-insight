import ItfToolsWorkspace from "@/features/insight-telecom/components/ItfToolsWorkspace";
import { loadItfCompanyWorkforceUnits } from "@/features/insight-telecom/roster/itfRoster.server";

const templateHref = "/downloads/itf/ITF_Roster_Import_Template.xlsx";

export default async function TelecomFulfillmentTools({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const workforceUnits = await loadItfCompanyWorkforceUnits(slug);

  return <ItfToolsWorkspace companySlug={slug} templateHref={templateHref} workforceUnits={workforceUnits} />;
}
