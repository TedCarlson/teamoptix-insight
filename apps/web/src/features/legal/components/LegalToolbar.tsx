import styles from "./legal-workspace.module.css";

type Props = {
  document?: unknown;
  draftMode: boolean;
  onToggleDraft: () => void;
};

function documentValue(document: unknown, key: "title" | "status" | "version") {
  if (!document || typeof document !== "object") return null;

  const value = (document as Record<string, unknown>)[key];
  return typeof value === "string" || typeof value === "number" ? value : null;
}

export function LegalToolbar({
  document,
  draftMode,
  onToggleDraft,
}: Props) {
  const title = documentValue(document, "title") ?? "Master Service Agreement";
  const status = documentValue(document, "status");
  const version = documentValue(document, "version");

  return (
    <header className={styles.toolbar}>
      <div>
        <p className={styles.eyebrow}>Document Workspace</p>
        <h2 className={styles.title}>{title}</h2>
        <p className={styles.toolbarMeta}>
          {[status, version ? `v${version}` : null].filter(Boolean).join(" · ") ||
            "Draft document"}
        </p>
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
