import styles from "./legal-workspace.module.css";

type Props = {
  document?: any;
  draftMode?: boolean;
  onToggleDraft?: () => void;
};

export function LegalToolbar({
  document,
  draftMode,
  onToggleDraft,
}: Props) {
  return (
    <header className={styles.toolbar}>
      <div>
        <p className={styles.eyebrow}>Commercial Agreements</p>
        <h1 className={styles.title}>
          {document?.title ?? "Master Service Agreement"}
        </h1>
      </div>

      <div className={styles.toolbarActions}>
        <button
          className={styles.secondaryButton}
          type="button"
          onClick={onToggleDraft}
        >
          {draftMode ? "Exit Draft" : "Draft Mode"}
        </button>
      </div>
    </header>
  );
}
