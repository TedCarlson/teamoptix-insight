export default function FleetStatusScan({ status }: { status: Record<string, unknown> | null }) {
  const metrics = [
    ["Total fleet","total_vehicles"],["Dispatch ready","dispatch_ready"],["Spare","spare_vehicles"],
    ["Unavailable","unavailable"],["Open defects","open_defects"],["Open work orders","open_work_orders"],
  ];
  return <section aria-label="Fleet status" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>{metrics.map(([label,key])=><article className="app-card" style={{ padding: 14 }} key={key}><p className="value-card__eyebrow">{label}</p><strong style={{ display: "block", fontSize: 28, marginTop: 6 }}>{String(status?.[key] ?? 0)}</strong></article>)}</section>;
}
