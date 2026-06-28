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
      <p className={styles.panelLabel}>Sections</p>

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
    </nav>
  );
}
