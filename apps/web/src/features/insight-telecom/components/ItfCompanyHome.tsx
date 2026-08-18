import Link from "next/link";
import type { ItfWorkspaceContext } from "../access/itfWorkspaceContext";
import type { ItfRosterReviewRow } from "../roster/itfRosterForm";
import styles from "./ItfCompanyHome.module.css";

type ItfCompanyHomeProps = {
  context: ItfWorkspaceContext;
  roster: ItfRosterReviewRow[];
};

function locationLabel(row: ItfRosterReviewRow) {
  if (row.placement.workforceUnit === "410") return "410 Keystone";
  if (row.placement.workforceUnit === "427") return "427 Freedom";
  return "Company";
}

export default function ItfCompanyHome({ context, roster }: ItfCompanyHomeProps) {
  const base = `/insight/telecom-fulfillment/${context.company_slug}`;
  const previewRows = roster.slice(0, 6);

  return (
    <main className={styles.page} aria-label="Telecom Fulfillment home">
      <div className={styles.primaryGrid}>
        <section className={styles.section}>
          <header className={styles.sectionHeader}>
            <div>
              <h1>Roster</h1>
              <span>{roster.length} company workforce records</span>
            </div>
            <Link href={`${base}/roster`}>Open roster →</Link>
          </header>
          <table className={styles.rosterTable}>
            <thead><tr><th>Worker</th><th>Workforce unit</th><th>Status</th><th>Source</th></tr></thead>
            <tbody>
              {previewRows.length ? previewRows.map((row) => (
                <tr key={row.id}>
                  <td><strong>{row.person.fullName}</strong><span>{row.placement.positionTitle}</span></td>
                  <td>{locationLabel(row)}</td>
                  <td>{row.person.status.replaceAll("_", " ")}</td>
                  <td>{row.source}</td>
                </tr>
              )) : (
                <tr><td colSpan={4} className={styles.rosterEmpty}>No ITF roster rows connected. Start in Roster to establish the workforce.</td></tr>
              )}
            </tbody>
          </table>
          <p className={styles.notice}>{previewRows.length < roster.length ? `Showing ${previewRows.length} of ${roster.length}. ` : ""}Roster identity and workforce assignment now anchor every later operational and metric record.</p>
        </section>

        <section className={styles.section}>
          <header className={styles.sectionHeader}>
            <div>
              <h2>Messages</h2>
              <span>ITF communication</span>
            </div>
            <span>Not connected</span>
          </header>
          <div className={styles.empty}>
            <strong>No ITF message stream yet</strong>
            <p>Targeted messages, acknowledgements, and company communication will appear here.</p>
          </div>
        </section>
      </div>

      <section className={styles.section}>
        <header className={styles.sectionHeader}>
          <div>
            <h2>Workspaces</h2>
            <span>Telecom Fulfillment</span>
          </div>
          <span>{context.can_manage ? "Company management access" : "Assigned access"}</span>
        </header>
        <div className={styles.workspaceRows}>
          <Link href={`${base}/roster`}><strong>Roster</strong><span>Identity, onboarding, and workforce assignment</span><b>Open →</b></Link>
          <Link href={`${base}/operations`}><strong>Operations</strong><span>Schedule, booking, Route Lock, check-ins, Field Log, and dispatch</span><b>Open →</b></Link>
          <Link href={`${base}/metrics`}><strong>Metrics</strong><span>Roster-linked scorecards, ranking, and performance visibility</span><b>Open →</b></Link>
          <Link href={`${base}/reports`}><strong>Reports</strong><span>Internal and client-safe projections</span><b>Open →</b></Link>
        </div>
      </section>

      <section className={styles.uploadSeam}>
        <div>
          <h2>Upload</h2>
          <p>Inspect, recognize, and normalize governed source files before any database allocation.</p>
        </div>
        <Link className="button" href={`${base}/tools`}>Open upload tools</Link>
      </section>
    </main>
  );
}
