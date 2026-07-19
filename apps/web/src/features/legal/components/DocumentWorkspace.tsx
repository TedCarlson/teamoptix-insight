"use client";

import Link from "next/link";

import { useMemo, useState } from "react";

import { EditorialNotesPanel } from "./EditorialNotesPanel";
import { LegalEditorPane } from "./LegalEditorPane";
import { LegalSectionRail } from "./LegalSectionRail";
import { LegalToolbar } from "./LegalToolbar";
import { LegalAcceptanceOverlay } from "./LegalAcceptanceOverlay";
import { CreateClientDocumentPanel } from "./CreateClientDocumentPanel";
import { LegalDocumentMetadataPanel } from "./LegalDocumentMetadataPanel";
import { LegalWorkflowSignals } from "./LegalWorkflowSignals";
import { RevisionHistoryPanel } from "./RevisionHistoryPanel";
import styles from "./legal-workspace.module.css";

function documentValue(document: unknown, key: string) {
  if (!document || typeof document !== "object") return null;
  const value = (document as Record<string, unknown>)[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : null;
}

type LegalSection = {
  id: string;
  document_id?: string | null;
  section_number?: string | number | null;
  title?: string | null;
  body_markdown?: string | null;
};

type LegalDocumentVersion = {
  id: string;
  document_id?: string | null;
  version_label?: string | null;
  title?: string | null;
  status?: string | null;
  section_count?: number | null;
  content_snapshot?: {
    document?: { title?: string | null; version_label?: string | null };
    sections?: Array<{
      section_number?: number | null;
      title?: string | null;
      body_markdown?: string | null;
    }>;
  } | null;
  created_at?: string | null;
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

type LegalDocumentRecord = Record<string, unknown>;

type LegalCustomerOption = {
  id: string;
  company_name: string;
  company_slug: string;
};

type DocumentWorkspaceProps = {
  document?: LegalDocumentRecord | null;
  sections?: LegalSection[] | null;
  versions?: LegalDocumentVersion[] | null;
  acceptances?: LegalDocumentAcceptance[] | null;
  customerOptions?: LegalCustomerOption[] | null;
  customerWorkspaceSlug?: string | null;
  exitHref?: string;
};

function formatVersionDate(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function DocumentWorkspace({
  document = null,
  sections,
  versions,
  acceptances,
  customerOptions,
  customerWorkspaceSlug = null,
  exitHref = "/teamoptix/business/contracts",
}: DocumentWorkspaceProps) {
  const [documentRecord, setDocumentRecord] = useState<LegalDocumentRecord | null>(document);
  const [sectionRows, setSectionRows] = useState<LegalSection[]>(() => {
    return Array.isArray(sections) ? sections : [];
  });
  const [versionRows, setVersionRows] = useState<LegalDocumentVersion[]>(() => {
    return Array.isArray(versions) ? versions : [];
  });
  const [acceptanceRows, setAcceptanceRows] = useState<LegalDocumentAcceptance[]>(() => {
    return Array.isArray(acceptances) ? acceptances : [];
  });
  const [selectedAcceptanceVersion, setSelectedAcceptanceVersion] = useState<LegalDocumentVersion | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState(() => {
    return Array.isArray(sections) ? sections[0]?.id ?? "" : "";
  });
  const [draftMode, setDraftMode] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [sectionActionState, setSectionActionState] = useState<"idle" | "saving" | "error">("idle");
  const [versionActionState, setVersionActionState] = useState<"idle" | "locking" | "locked" | "exists" | "error">("idle");
  const [versionActionMessage, setVersionActionMessage] = useState("");

  const safeSections = useMemo(() => sectionRows, [sectionRows]);

  const selectedSection = useMemo(() => {
    return (
      safeSections.find((section) => section.id === selectedSectionId) ??
      safeSections[0] ??
      null
    );
  }, [safeSections, selectedSectionId]);

  const documentTitle = documentValue(documentRecord, "title") ?? "Document";
  const documentId = documentValue(documentRecord, "id");
  const documentScope = documentValue(documentRecord, "document_scope") ?? "TEMPLATE";
  const isClientDocument = documentScope === "CLIENT_DOCUMENT";
  const hasLockedVersions = versionRows.some((version) => version.status === "LOCKED");
  const hasAcceptance = acceptanceRows.length > 0;
  const customerReviewHref =
    isClientDocument && hasLockedVersions && customerWorkspaceSlug
      ? `/company/${customerWorkspaceSlug}/admin/legal/required`
      : null;
  const fieldsReady = Boolean(
    documentValue(documentRecord, "customer_legal_name") && documentValue(documentRecord, "effective_at")
  );
  const lockActionTone = isClientDocument
    ? fieldsReady
      ? "go"
      : "blocked"
    : "go";

  function acceptedRecordForVersion(versionId: string) {
    return acceptanceRows.find((acceptance) => acceptance.document_version_id === versionId) ?? null;
  }

  function updateSection(section: LegalSection) {
    setSectionRows((current) =>
      current.map((row) => (row.id === section.id ? { ...row, ...section } : row))
    );
  }

  function replaceSections(nextSections: LegalSection[]) {
    setSectionRows(nextSections);
    setSelectedSectionId((current) => {
      if (nextSections.some((section) => section.id === current)) return current;
      return nextSections[0]?.id ?? "";
    });
  }

  async function runSectionAction(payload: Record<string, unknown>) {
    try {
      setSectionActionState("saving");
      const res = await fetch("/api/legal/section/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();

      if (!json?.ok) {
        setSectionActionState("error");
        return null;
      }

      setSectionActionState("idle");
      return json;
    } catch {
      setSectionActionState("error");
      return null;
    }
  }

  async function addSection() {
    if (!documentId) return;
    const json = await runSectionAction({
      action: "add",
      documentId,
      title: "New Section",
    });

    if (json?.section) {
      setSectionRows((current) => [...current, json.section]);
      setSelectedSectionId(json.section.id);
    }
  }

  async function moveSection(sectionId: string, direction: "up" | "down") {
    const json = await runSectionAction({
      action: "move",
      sectionId,
      direction,
    });

    if (Array.isArray(json?.sections)) {
      replaceSections(json.sections);
    }
  }

  async function archiveSection(sectionId: string) {
    const confirmed = window.confirm("Archive this section? It will be removed from the active draft.");
    if (!confirmed) return;

    const json = await runSectionAction({
      action: "archive",
      sectionId,
    });

    if (Array.isArray(json?.sections)) {
      replaceSections(json.sections);
    }
  }

  async function lockVersion() {
    if (!documentId) return;

    const confirmed = window.confirm(
      isClientDocument
        ? "Lock this customer document as the immutable version the customer can accept?"
        : "Lock this reusable template as the source for future customer documents?"
    );
    if (!confirmed) return;

    try {
      setVersionActionState("locking");
      const res = await fetch("/api/legal/document/version/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId }),
      });
      const json = await res.json();

      if (!json?.ok) {
        const unresolvedFields = Array.isArray(json?.unresolvedFields)
          ? json.unresolvedFields.join(", ")
          : "";
        const message = unresolvedFields
          ? `${json.error} Missing: ${unresolvedFields}`
          : json?.error || "Version lock failed.";
        setVersionActionMessage(message);
        window.alert(message);
        setVersionActionState("error");
        return;
      }

      setVersionActionMessage("");

      if (json.version) {
        setVersionRows((current) => {
          if (current.some((version) => version.id === json.version.id)) return current;
          return [json.version, ...current];
        });
      }

      setVersionActionState(json.alreadyLocked ? "exists" : "locked");
      setTimeout(() => setVersionActionState("idle"), 1800);
    } catch {
      setVersionActionState("error");
    }
  }

  function recordAcceptance(acceptance: LegalDocumentAcceptance) {
    setAcceptanceRows((current) => {
      if (current.some((row) => row.id === acceptance.id)) return current;
      return [acceptance, ...current];
    });
  }

  async function deleteDraftClientDocument() {
    if (!documentId || !isClientDocument) return;

    const confirmed = window.confirm(
      "Delete this draft client document? This is only allowed before locked versions, customer release, or acceptance."
    );

    if (!confirmed) return;

    const res = await fetch("/api/legal/document/client/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId }),
    });

    const json = await res.json().catch(() => null);

    if (!json?.ok) {
      window.alert(json?.error ?? "Client document delete failed.");
      return;
    }

    window.location.href = exitHref;
  }

  if (!selectedSection) {
    return (
      <section className={styles.workspace}>
        <LegalToolbar
          document={documentRecord}
          draftMode={draftMode}
          exitHref={exitHref}
          versionActionState={versionActionState}
          documentScope={documentScope}
          lockActionTone={lockActionTone}
          releaseHref={customerReviewHref}
          onToggleDraft={() => setDraftMode((current) => !current)}
          onOpenReview={() => setReviewOpen(true)}
          onLockVersion={lockVersion}
        />
        <div className={styles.emptyState}>
          <p>No sections loaded.</p>
          {draftMode && documentId ? (
            <button className={styles.primaryButton} type="button" onClick={addSection}>
              Add First Section
            </button>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section className={styles.workspace}>
      <LegalToolbar
        document={documentRecord}
        draftMode={draftMode}
        exitHref={exitHref}
        versionActionState={versionActionState}
        documentScope={documentScope}
        lockActionTone={lockActionTone}
        releaseHref={customerReviewHref}
        onToggleDraft={() => setDraftMode((current) => !current)}
        onOpenReview={() => setReviewOpen(true)}
        onLockVersion={lockVersion}
      />

      {versionActionMessage ? (
        <p className={styles.saveError}>{versionActionMessage}</p>
      ) : null}

      {draftMode ? (
        <p className={sectionActionState === "error" ? styles.saveError : styles.saveStatus}>
          Section structure: {sectionActionState}
        </p>
      ) : null}

      <div className={styles.body}>
        <LegalSectionRail
          draftMode={draftMode}
          selectedSectionId={selectedSection.id}
          onSelectSection={setSelectedSectionId}
          onAddSection={addSection}
          onMoveSection={moveSection}
          onArchiveSection={archiveSection}
          sections={safeSections}
        />

        <LegalEditorPane
          key={selectedSection.id}
          draftMode={draftMode}
          section={selectedSection}
          onSectionSaved={updateSection}
        />

        <aside className={styles.inspector}>
          <LegalWorkflowSignals
            documentScope={documentScope}
            draftMode={draftMode}
            hasLockedVersions={hasLockedVersions}
            hasAcceptance={hasAcceptance}
            fieldsReady={fieldsReady}
          />

          {isClientDocument && !hasLockedVersions && !hasAcceptance ? (
            <section className={styles.inspectorSection}>
              <p className={styles.panelLabel}>Draft Controls</p>
              <button className={styles.secondaryButton} type="button" onClick={deleteDraftClientDocument}>
                Delete Draft Client Document
              </button>
              <p className={styles.emptyHelper}>
                Delete is available only before this client document is locked, released, accepted, or vaulted.
              </p>
            </section>
          ) : null}

          {isClientDocument ? (
            <LegalDocumentMetadataPanel
              document={documentRecord as Record<string, string | number | null>}
              onSaved={(updatedDocument) => setDocumentRecord((current: LegalDocumentRecord | null) => ({
                ...(current && typeof current === "object" ? current : {}),
                ...updatedDocument,
              }))}
            />
          ) : documentId ? (
            <CreateClientDocumentPanel
              templateDocumentId={documentId}
              versions={versionRows}
              customerOptions={customerOptions ?? []}
            />
          ) : null}

          <section className={styles.inspectorSection}>
            <div className={styles.inspectorHeadingRow}>
              <p className={styles.panelLabel}>Locked Versions</p>
              <span className={styles.sectionBadge}>{versionRows.length}</span>
            </div>

            <div className={styles.cardStack}>
              {versionRows.length ? (
                versionRows.map((version) => (
                  <article key={version.id} className={styles.versionCard}>
                    <div>
                      <p className={styles.revisionTitle}>Version {version.version_label ?? "—"}</p>
                      <p className={styles.revisionDetail}>
                        {version.status ?? "LOCKED"} · {version.section_count ?? 0} sections
                      </p>
                      {acceptedRecordForVersion(version.id) ? (
                        <p className={styles.revisionDetail}>
                          Accepted {formatVersionDate(acceptedRecordForVersion(version.id)?.accepted_at)}
                        </p>
                      ) : null}
                    </div>
                    <div className={styles.versionCardActions}>
                      <span className={styles.revisionTime}>{formatVersionDate(version.created_at)}</span>
                      {isClientDocument ? (
                        acceptedRecordForVersion(version.id) ? (
                          <button
                            className={styles.miniButton}
                            type="button"
                            onClick={() => setSelectedAcceptanceVersion(version)}
                          >
                            View Acceptance
                          </button>
                        ) : customerReviewHref ? (
                          <Link className={styles.miniButton} href={customerReviewHref}>
                            Send to Client
                          </Link>
                        ) : (
                          <button className={styles.miniButton} type="button" disabled>
                            Send to Client
                          </button>
                        )
                      ) : (
                        <span className={styles.revisionDetail}>Template source</span>
                      )}
                    </div>
                  </article>
                ))
              ) : (
                <p className={styles.emptyHelper}>No locked versions yet.</p>
              )}
            </div>
          </section>
          <EditorialNotesPanel sectionId={selectedSection.id} />
          <RevisionHistoryPanel sectionId={selectedSection.id} />
        </aside>
      </div>

      {selectedAcceptanceVersion ? (
        <LegalAcceptanceOverlay
          version={selectedAcceptanceVersion}
          existingAcceptance={acceptedRecordForVersion(selectedAcceptanceVersion.id)}
          onClose={() => setSelectedAcceptanceVersion(null)}
          onAccepted={(acceptance) => {
            recordAcceptance(acceptance);
            setSelectedAcceptanceVersion(null);
          }}
        />
      ) : null}

      {reviewOpen ? (
        <div className={styles.reviewBackdrop} role="presentation">
          <section className={styles.reviewPanel} role="dialog" aria-modal="true" aria-label="Document review">
            <header className={styles.reviewHeader}>
              <div>
                <p className={styles.eyebrow}>Review Document</p>
                <h2 className={styles.title}>{documentTitle}</h2>
                <p className={styles.toolbarMeta}>Full assembled document preview</p>
              </div>

              <div className={styles.toolbarActions}>
                <button className={styles.secondaryButton} type="button" disabled>
                  Word
                </button>
                <button className={styles.secondaryButton} type="button" disabled>
                  PDF
                </button>
                <button className={styles.primaryButton} type="button" onClick={() => setReviewOpen(false)}>
                  Close
                </button>
              </div>
            </header>

            <article className={styles.reviewDocument}>
              {safeSections.map((section) => (
                <section key={section.id} className={styles.reviewSection}>
                  <p className={styles.panelLabel}>Section {section.section_number ?? "—"}</p>
                  <h3>{section.title ?? "Untitled Section"}</h3>
                  {(section.body_markdown ?? "")
                    .split(/\n{2,}/)
                    .map((paragraph) => paragraph.trim())
                    .filter(Boolean)
                    .map((paragraph, paragraphIndex) => (
                      <p key={`${section.id}-${paragraphIndex}`}>{paragraph}</p>
                    ))}
                </section>
              ))}
            </article>
          </section>
        </div>
      ) : null}
    </section>
  );
}
