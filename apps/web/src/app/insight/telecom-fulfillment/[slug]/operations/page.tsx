import ItfWorkspaceSurface, { itfSurfaceStyles as styles } from "@/features/insight-telecom/components/ItfWorkspaceSurface";

const workflows = [
  ["Schedule", "Location and team schedule visibility for authorized workforce."],
  ["Booking & quota", "Demand, capacity, and production allocation from the donor contract."],
  ["Route Lock", "Route assignment and lock-state workflow."],
  ["Check-ins", "Shift presence and validation signals."],
  ["Field Log", "Field activity and operational exception record."],
  ["Dispatch", "Location-scoped work coordination."],
] as const;

export default function TelecomFulfillmentOperations() {
  return (
    <ItfWorkspaceSurface title="Operations" description="Telecom workforce and field operations.">
      <section className={styles.section}>
        <div className={styles.sectionHeader}><h2>ITF workflows</h2><span>Audited donor contract · records not connected</span></div>
        <div className={styles.workflowList}>
          {workflows.map(([name, description]) => <div className={styles.workflowRow} key={name}><strong>{name}</strong><span>{description}</span><small>Not connected</small></div>)}
        </div>
      </section>
    </ItfWorkspaceSurface>
  );
}
