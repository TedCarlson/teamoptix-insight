import DriverFleetInspectionForm from "@/features/fleet/inspections/DriverFleetInspectionForm";
import { listFleetVehicles } from "@/features/fleet/server/fleet.repository";

export default async function ManagerFleetInspectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params; const vehicles = await listFleetVehicles(slug);
  return <main style={{ maxWidth: 720, margin: "0 auto", width: "100%" }}><DriverFleetInspectionForm companySlug={slug} vehicles={vehicles.filter((vehicle) => vehicle.status !== "RETIRED")} context="manager" /></main>;
}
