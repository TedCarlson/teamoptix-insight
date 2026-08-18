import ItfWorkspaceSurface, {
  itfSurfaceStyles as styles,
} from "@/features/insight-telecom/components/ItfWorkspaceSurface";

const metricColumns = [
  "tNPS",
  "FTR",
  "Tool Usage",
  "48Hr Contact",
  "Pure Pass",
  "SOI",
  "Repeat",
  "Rework",
  "MET",
] as const;

export default function TelecomFulfillmentMetrics() {
  return (
    <ItfWorkspaceSurface
      title="Metrics"
      description="Technicians down the rows and configured ITF metrics across the columns."
    >
      <section className={styles.section}>
        <div className={styles.controls} aria-label="Metric filters">
          <label className={styles.control}>
            <span>Class</span>
            <select defaultValue="NSR">
              <option value="NSR">NSR</option>
              <option value="SMART">SMART</option>
            </select>
          </label>

          <label className={styles.control}>
            <span>Range</span>
            <select defaultValue="FM">
              <option value="FM">Current</option>
              <option value="PREVIOUS">Previous</option>
              <option value="3FM">3FM</option>
              <option value="12FM">12FM</option>
            </select>
          </label>

          <label className={styles.control}>
            <span>Location</span>
            <select defaultValue="all">
              <option value="all">All locations</option>
            </select>
          </label>

          <label className={styles.control}>
            <span>Company</span>
            <select defaultValue="all">
              <option value="all">All companies</option>
            </select>
          </label>

          <label className={styles.control}>
            <span>Team</span>
            <select defaultValue="all">
              <option value="all">All teams</option>
            </select>
          </label>

          <span className={styles.controlStatus}>Authorized rows only</span>
        </div>

        <div className={styles.matrixToolbar}>
          <strong>Team performance</strong>
          <div>
            <label className={styles.sortControl}>
              <span className={styles.visuallyHidden}>Sort technicians</span>
              <select defaultValue="rank">
                <option value="rank">Sort: Rank</option>
                <option value="composite">Sort: Composite</option>
                <option value="name">Sort: Name</option>
                <option value="jobs">Sort: Jobs</option>
              </select>
            </label>
            <span className={styles.rowCount}>0 rows</span>
          </div>
        </div>

        <div className={styles.matrixWrap}>
          <table className={styles.matrixTable}>
            <thead>
              <tr>
                <th className={styles.techColumn}>Technician</th>
                <th>Composite</th>
                {metricColumns.map((metric) => <th key={metric}>{metric}</th>)}
                <th>Jobs</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={metricColumns.length + 3} className={styles.emptyMatrix}>
                  Roster technicians will populate this matrix after ITF roster and metric records are connected.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </ItfWorkspaceSurface>
  );
}
