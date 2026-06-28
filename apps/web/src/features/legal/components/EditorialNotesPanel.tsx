import styles from "./legal-workspace.module.css";

type EditorialNotesPanelProps = {
  sectionId: string;
};

const notesBySection: Record<string, string[]> = {
  overview: [
    "Keep the opening language plain and executive-readable.",
    "Avoid locking customer-specific pricing into the base agreement.",
  ],
  services: [
    "Reference service schedules rather than hardcoding future product scope.",
    "Keep implementation and support responsibilities distinct.",
  ],
  "commercial-terms": [
    "Confirm renewal language before publishing.",
    "Commercial changes should route through approval before signature.",
  ],
  billing: [
    "Payment processor setup should remain outside the legal agreement body.",
    "Billing ownership belongs in the customer billing profile.",
  ],
  confidentiality: ["Keep confidentiality duties mutual unless counsel directs otherwise."],
  termination: ["Confirm cure periods and post-termination data handling."],
  signatures: ["Final signature authority should match the customer approval record."],
};

export function EditorialNotesPanel({ sectionId }: EditorialNotesPanelProps) {
  const notes = notesBySection[sectionId] ?? [];

  return (
    <section className={styles.inspectorSection}>
      <p className={styles.panelLabel}>Editorial Notes</p>

      <div className={styles.cardStack}>
        {notes.map((note) => (
          <article key={note} className={styles.noteCard}>
            {note}
          </article>
        ))}
      </div>
    </section>
  );
}
