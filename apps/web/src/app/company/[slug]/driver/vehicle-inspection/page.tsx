import DriverFleetInspectionForm from "@/features/fleet/inspections/DriverFleetInspectionForm";
import { listFleetVehicles } from "@/features/fleet/server/fleet.repository";
import { DriverMobileShell } from "@/features/driver/shell/DriverMobileShell";

export default async function DriverVehicleInspectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params; const vehicles = await listFleetVehicles(slug);
  return <DriverMobileShell slug={slug}><DriverFleetInspectionForm companySlug={slug} vehicles={vehicles.filter(v => v.status !== "RETIRED")} /></DriverMobileShell>;
}
