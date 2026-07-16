import FleetSeamPage from "@/features/fleet/pages/FleetSeamPage";
import FleetQueueTable from "@/features/fleet/components/FleetQueueTable";
import { listFleetInspections } from "@/features/fleet/server/fleet.repository";
import Link from "next/link";

export default async function FleetInspectionsPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const rows = await listFleetInspections(slug);
  return <FleetSeamPage slug={slug} eyebrow="Fleet · Inspections" title="Inspections" description="Driver inspection records, revealed defects, and review status."><div><Link className="button button-primary" href={`/company/${slug}/fleet/inspections/new`}>Start Leadership Inspection</Link></div><FleetQueueTable title="Inspection History" rows={rows} columns={[{key:"started_at",label:"Date"},{key:"unit_number",label:"Unit"},{key:"driver_name",label:"Driver"},{key:"inspection_type",label:"Type"},{key:"status",label:"Status"},{key:"defect_count",label:"Defects"},{key:"safe_to_operate_driver",label:"Safe"}]} /></FleetSeamPage>;
}
