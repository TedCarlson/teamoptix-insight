import FleetSeamPage from "@/features/fleet/pages/FleetSeamPage";
import FleetQueueTable from "@/features/fleet/components/FleetQueueTable";
import { listFleetDefects, listFleetWorkOrders } from "@/features/fleet/server/fleet.repository";
import { listFleetVehicles } from "@/features/fleet/server/fleet.repository";
import FleetWorkOrderControls from "@/features/fleet/components/FleetWorkOrderControls";

export default async function FleetMaintenancePage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const rows = await listFleetWorkOrders(slug);
  const vehicles = await listFleetVehicles(slug);
  const defects = await listFleetDefects(slug);
  return <FleetSeamPage><FleetWorkOrderControls companySlug={slug} vehicles={vehicles} orders={rows} defects={defects} /><FleetQueueTable title="Work Orders" rows={rows} columns={[{key:"work_order_number",label:"WO #"},{key:"unit_number",label:"Unit"},{key:"priority",label:"Priority"},{key:"status",label:"Status"},{key:"title",label:"Scope"},{key:"mechanic_name",label:"Mechanic"},{key:"total_cost",label:"Cost"}]} /></FleetSeamPage>;
}
