import FleetSeamPage from "@/features/fleet/pages/FleetSeamPage";
import FleetVehicleGrid from "@/features/fleet/components/FleetVehicleGrid";
import { listFleetVehicles } from "@/features/fleet/server/fleet.repository";

export default async function FleetVehiclesPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const vehicles = await listFleetVehicles(slug);
  return (
    <FleetSeamPage slug={slug} eyebrow="Fleet · Vehicles" title="Vehicles" description="Vehicle inventory, readiness, assignment, inspections, and maintenance exposure.">
      <FleetVehicleGrid rows={vehicles} companySlug={slug} />
    </FleetSeamPage>
  );
}
