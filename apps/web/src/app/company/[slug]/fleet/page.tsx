import FleetSeamPage from "@/features/fleet/pages/FleetSeamPage";
import FleetStatusScan from "@/features/fleet/components/FleetStatusScan";
import { getFleetStatus } from "@/features/fleet/server/fleet.repository";

export default async function FleetPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const status = await getFleetStatus(slug);

  return (
    <FleetSeamPage
      slug={slug}
      eyebrow="Fleet"
      title="Fleet Home"
      description="A single operational home for vehicle readiness, maintenance, and inspections."
    ><FleetStatusScan status={status} /></FleetSeamPage>
  );
}
