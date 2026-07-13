"use client";

import { useMemo, useState } from "react";
import styles from "./legal-workspace.module.css";

type LegalDocumentVersion = {
  id: string;
  version_label?: string | null;
  title?: string | null;
  content_snapshot?: {
    document?: { title?: string | null; version_label?: string | null };
    sections?: Array<{
      section_number?: number | null;
      title?: string | null;
      body_markdown?: string | null;
    }>;
  } | null;
};

type LegalDocumentAcceptance = {
  id: string;
  document_version_id?: string | null;
  accepted_by_name?: string | null;
  accepted_by_email?: string | null;
  accepted_by_title?: string | null;
  accepted_by_company?: string | null;
  accepted_at?: string | null;
};

type Props = {
  version: LegalDocumentVersion;
  existingAcceptance?: LegalDocumentAcceptance | null;
  onClose: () => void;
  onAccepted: (acceptance: LegalDocumentAcceptance) => void;
};

function paragraphs(markdown?: string | null) {
  return (markdown ?? "")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function formatAcceptedAt(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function LegalAcceptanceOverlay({
  version,
  existingAcceptance,
  onClose,
  onAccepted,
}: Props) {
  const [acceptedByName, setAcceptedByName] = useState(existingAcceptance?.accepted_by_name ?? "");
  const [acceptedByEmail, setAcceptedByEmail] = useState(existingAcceptance?.accepted_by_email ?? "");
  const [acceptedByTitle, setAcceptedByTitle] = useState(existingAcceptance?.accepted_by_title ?? "");
  const [acceptedByCompany, setAcceptedByCompany] = useState(existingAcceptance?.accepted_by_company ?? "");
  const [acknowledgmentChecked, setAcknowledgmentChecked] = useState(Boolean(existingAcceptance));
  const [saveState, setSaveState] = useState<"idle" | "saving" | "accepted" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const sections = useMemo(() => {
    return Array.isArray(version.content_snapshot?.sections)
      ? version.content_snapshot.sections
      : [];
  }, [version.content_snapshot]);

  const title =
    version.content_snapshot?.document?.title ??
    version.title ??
    "Document";
  const versionLabel =
    version.content_snapshot?.document?.version_label ??
    version.version_label ??
    "—";

  async function accept() {
    if (existingAcceptance) return;
    setError(null);

    if (!acceptedByName.trim() || !acceptedByEmail.trim() || !acknowledgmentChecked) {
      setError("Signer name, signer email, and acknowledgment are required.");
      return;
    }

    try {
      setSaveState("saving");
      const res = await fetch("/api/legal/document/version/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentVersionId: version.id,
          acceptedByName,
          acceptedByEmail,
          acceptedByTitle,
          acceptedByCompany,
          acknowledgmentChecked,
        }),
      });

      const json = await res.json();
      if (!json?.ok || !json.acceptance) {
        setSaveState("error");
        setError(json?.error ?? "Document acceptance failed.");
        return;
      }

      setSaveState("accepted");
      onAccepted(json.acceptance);
    } catch {
      setSaveState("error");
      setError("Document acceptance failed.");
    }
  }

  return (
    <div className={styles.acceptanceBackdrop} role="presentation">
      <section
        className={styles.acceptancePanel}
        role="dialog"
        aria-modal="true"
        aria-label="Document acceptance"
      >
        <header className={styles.acceptanceHeader}>
          <div>
            <p className={styles.eyebrow}>Document Acceptance</p>
            <h2 className={styles.title}>{title}</h2>
            <p className={styles.toolbarMeta}>Locked Version {versionLabel}</p>
          </div>

          <button className={styles.secondaryButton} type="button" onClick={onClose}>
            Close
          </button>
        </header>

        <div className={styles.acceptanceLayout}>
          <article className={styles.acceptanceDocument}>
            {sections.map((section) => (
              <section key={`${section.section_number}-${section.title}`} className={styles.reviewSection}>
                <p className={styles.panelLabel}>Section {section.section_number ?? "—"}</p>
                <h3>{section.title ?? "Untitled Section"}</h3>
                {paragraphs(section.body_markdown).map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </section>
            ))}
          </article>

          <aside className={styles.acceptanceAside}>
            <p className={styles.panelLabel}>Electronic Acknowledgment</p>
            <p className={styles.acceptanceCopy}>
              Please review this document before continuing. By checking the box below and selecting Read & Accept, you acknowledge that you are authorized to accept this document on behalf of your organization and agree to this document electronically.
            </p>

            {existingAcceptance ? (
              <div className={styles.acceptanceRecord}>
                <p className={styles.revisionTitle}>Accepted</p>
                <p className={styles.revisionDetail}>{existingAcceptance.accepted_by_name}</p>
                <p className={styles.revisionDetail}>{existingAcceptance.accepted_by_email}</p>
                <p className={styles.revisionDetail}>{formatAcceptedAt(existingAcceptance.accepted_at)}</p>
              </div>
            ) : (
              <div className={styles.acceptanceFields}>
                <label className={styles.titleFieldLabel}>
                  <span>Signer name</span>
                  <input
                    className={styles.titleInput}
                    value={acceptedByName}
                    onChange={(event) => setAcceptedByName(event.target.value)}
                  />
                </label>

                <label className={styles.titleFieldLabel}>
                  <span>Signer email</span>
                  <input
                    className={styles.titleInput}
                    type="email"
                    value={acceptedByEmail}
                    onChange={(event) => setAcceptedByEmail(event.target.value)}
                  />
                </label>

                <label className={styles.titleFieldLabel}>
                  <span>Title</span>
                  <input
                    className={styles.titleInput}
                    value={acceptedByTitle}
                    onChange={(event) => setAcceptedByTitle(event.target.value)}
                  />
                </label>

                <label className={styles.titleFieldLabel}>
                  <span>Company</span>
                  <input
                    className={styles.titleInput}
                    value={acceptedByCompany}
                    onChange={(event) => setAcceptedByCompany(event.target.value)}
                  />
                </label>

                <label className={styles.acceptanceCheck}>
                  <input
                    type="checkbox"
                    checked={acknowledgmentChecked}
                    onChange={(event) => setAcknowledgmentChecked(event.target.checked)}
                  />
                  <span>I have read and accept this document electronically.</span>
                </label>

                {error ? <p className={styles.saveError}>{error}</p> : null}

                <button
                  className={styles.primaryButton}
                  type="button"
                  disabled={saveState === "saving" || !acknowledgmentChecked}
                  onClick={accept}
                >
                  {saveState === "saving" ? "Accepting..." : "Read & Accept"}
                </button>

                <button className={styles.secondaryButton} type="button" disabled>
                  Download PDF
                </button>
              </div>
            )}
          </aside>
        </div>
      </section>
    </div>
  );
}
