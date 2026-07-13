import Link from "next/link";
import styles from "./legal-workspace.module.css";

type Props = {
  document?: unknown;
  draftMode: boolean;
  exitHref: string;
  versionActionState: "idle" | "locking" | "locked" | "exists" | "error";
  documentScope?: string;
  lockActionTone?: "go" | "next" | "blocked" | "muted";
  releaseHref?: string | null;
  onToggleDraft: () => void;
  onOpenReview: () => void;
  onLockVersion: () => void;
};

function documentValue(document: unknown, key: string) {
  if (!document || typeof document !== "object") return null;
  const value = (document as Record<string, unknown>)[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : null;
}

function documentVersion(document: unknown) {
  const currentVersion = documentValue(document, "current_version");
  if (currentVersion) return currentVersion;

  const major = documentValue(document, "version_major") ?? "0";
  const minor = documentValue(document, "version_minor") ?? "1";
  const patch = documentValue(document, "version_patch") ?? "0";

  return `${major}.${minor}.${patch}`;
}

function lockLabel(state: Props["versionActionState"]) {
  if (state === "locking") return "Locking...";
  if (state === "locked") return "Version Locked";
  if (state === "exists") return "Already Locked";
  if (state === "error") return "Lock Failed";
  return "Lock Version";
}

export function LegalToolbar({
  document,
  draftMode,
  exitHref,
  versionActionState,
  documentScope = "TEMPLATE",
  lockActionTone = "next",
  releaseHref,
  onToggleDraft,
  onOpenReview,
  onLockVersion,
}: Props) {
  const title = documentValue(document, "title") ?? "Document";
  const status = documentValue(document, "status") ?? "DRAFT";
  const version = documentVersion(document);
  const lockDisabled = versionActionState === "locking" || lockActionTone === "blocked";
  const lockClassName = [
    styles.secondaryButton,
    lockActionTone === "go" ? styles.actionButtonGo : "",
    lockActionTone === "next" ? styles.actionButtonNext : "",
    lockActionTone === "blocked" ? styles.actionButtonBlocked : "",
    lockActionTone === "muted" ? styles.actionButtonMuted : "",
  ].filter(Boolean).join(" ");
  const isClientDocument = documentScope === "CLIENT_DOCUMENT";
  const eyebrow = isClientDocument ? "Client Document Workbench" : "Template Workbench";

  return (
    <header className={styles.toolbar}>
      <div>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.toolbarMeta}>
          Version {version} · {status} · {isClientDocument ? "Client Document" : "Template"}
        </p>
      </div>

      <div className={styles.toolbarActions}>
        <button className={styles.secondaryButton} type="button" onClick={onToggleDraft}>
          {draftMode ? "Exit Draft" : "Draft Mode"}
        </button>

        <button className={styles.secondaryButton} type="button" disabled>
          Save Draft
        </button>

        <button className={[styles.secondaryButton, styles.actionButtonNext].join(" ")} type="button" onClick={onOpenReview}>
          Review Document
        </button>

        <button className={styles.secondaryButton} type="button" disabled>
          Export
        </button>

        <button className={lockClassName} type="button" onClick={onLockVersion} disabled={lockDisabled}>
          {lockLabel(versionActionState)}
        </button>

        {isClientDocument ? (
          releaseHref ? (
            <Link className={[styles.secondaryButton, styles.actionButtonGo].join(" ")} href={releaseHref}>
              Release to Customer
            </Link>
          ) : (
            <button className={styles.secondaryButton} type="button" disabled>
              Release to Customer
            </button>
          )
        ) : (
          <button className={styles.secondaryButton} type="button" disabled>
            Publish
          </button>
        )}

        <Link className={styles.primaryButton} href={exitHref}>
          Exit Document
        </Link>
      </div>
    </header>
  );
}
