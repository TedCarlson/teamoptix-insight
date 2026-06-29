import styles from "./legal-workspace.module.css";

type LegalSectionRailProps = {
  selectedSectionId: string;
  onSelectSection: (id: string) => void;
  sections: {
    id: string;
    section_number?: string | number | null;
    title?: string | null;
  }[];
};

export function LegalSectionRail({
  selectedSectionId,
  onSelectSection,
  sections = [],
}: LegalSectionRailProps) {
  const safeSections = Array.isArray(sections) ? sections : [];

  return (
    <nav className={styles.rail} aria-label="Agreement sections">
      <div className={styles.railHeader}>
        <p className={styles.panelLabel}>Sections</p>
      </div>

      <div className={styles.railScroll}>
        <div className={styles.sectionList}>
          {safeSections.map((section) => (
            <button
              key={section.id}
              className={
                section.id === selectedSectionId
                  ? styles.sectionButtonActive
                  : styles.sectionButton
              }
              type="button"
              onClick={() => onSelectSection(section.id)}
            >
              <span className={styles.sectionNumber}>
                {section.section_number ?? "—"}
              </span>
              <span>{section.title ?? "Untitled Section"}</span>
            </button>
          ))}
        </div>
      </div>

      <div className={styles.railFooter}>{safeSections.length} sections</div>
    </nav>
  );
}
