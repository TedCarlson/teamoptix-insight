import styles from "./legal-workspace.module.css";

type Props = {
  selectedSectionId: string;
  onSelectSection: (id: string) => void;
  sections: any[];
};

export function LegalSectionRail({
  selectedSectionId,
  onSelectSection,
  sections = [],
}: Props) {
  const safeSections = Array.isArray(sections) ? sections : [];

  return (
    <nav className={styles.rail}>
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
              {section.section_number}. {section.title}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.railFooter}>
        <span className={styles.saveStatus}>Rail Active</span>
      </div>
    </nav>
  );
}
