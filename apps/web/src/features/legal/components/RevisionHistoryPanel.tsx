import styles from "./legal-workspace.module.css";

type RevisionHistoryPanelProps = {
  sectionId: string;
};

const revisions = [
  {
    id: "draft-created",
    title: "Draft created",
    detail: "Initial agreement workspace prepared.",
    time: "Today",
  },
  {
    id: "section-ready",
    title: "Section ready",
    detail: "Current section is available for editorial review.",
    time: "Today",
  },
];

export function RevisionHistoryPanel({ sectionId }: RevisionHistoryPanelProps) {
  return (
    <section className={styles.inspectorSection}>
      <div className={styles.inspectorHeadingRow}>
        <p className={styles.panelLabel}>Revision History</p>
        <span className={styles.sectionBadge}>{sectionId}</span>
      </div>

      <div className={styles.cardStack}>
        {revisions.map((revision) => (
          <article key={revision.id} className={styles.revisionCard}>
            <div>
              <h3 className={styles.revisionTitle}>{revision.title}</h3>
              <p className={styles.revisionDetail}>{revision.detail}</p>
            </div>
            <span className={styles.revisionTime}>{revision.time}</span>
          </article>
        ))}
      </div>
    </section>
  );
}
