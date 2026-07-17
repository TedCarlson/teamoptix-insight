import FleetSeamPage from "@/features/fleet/pages/FleetSeamPage";
import FleetVehicleGrid from "@/features/fleet/components/FleetVehicleGrid";
import { listFleetVehicles } from "@/features/fleet/server/fleet.repository";

export default async function FleetVehiclesPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const vehicles = await listFleetVehicles(slug);
  return (
    <FleetSeamPage>
      <FleetVehicleGrid rows={vehicles} companySlug={slug} />
    </FleetSeamPage>
  );
}
