import Link from "next/link";
import TeamOptixShell from "@/features/teamoptix/navigation/TeamOptixShell";
import { EvidencePrintButton } from "@/features/legal/components/EvidencePrintButton";
import { getCustomerLegalTaskForVaultItem, getDocumentVaultItem } from "@/features/legal/server/legal.repository";
import { WorkspaceHeader, WorkspaceSection } from "@/features/ui/workspace";

export const dynamic = "force-dynamic";

type EvidenceSection = {
  section_number?: number | null;
  title?: string | null;
  body_markdown?: string | null;
};

type LegalTask = {
  id: string;
  status?: string | null;
  teamoptix_executed_at?: string | null;
  teamoptix_executed_by?: string | null;
  completed_at?: string | null;
  blocking_reason?: string | null;
};

type VaultItem = {
  id: string;
  document_type?: string | null;
  document_title?: string | null;
  version_label?: string | null;
  artifact_status?: string | null;
  storage_status?: string | null;
  storage_path?: string | null;
  pdf_storage_path?: string | null;
  checksum?: string | null;
  accepted_by_name?: string | null;
  accepted_by_email?: string | null;
  accepted_by_title?: string | null;
  accepted_by_company?: string | null;
  accepted_at?: string | null;
  created_at?: string | null;
  content_snapshot?: {
    document?: {
      title?: string | null;
      version_label?: string | null;
      customer_legal_name?: string | null;
      effective_at?: string | null;
      provider_name?: string | null;
    } | null;
    sections?: EvidenceSection[];
  } | null;
};

type Props = {
  params: Promise<{ vaultItemId: string }>;
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function documentHref(item: VaultItem) {
  if (item.document_type === "STATEMENT_OF_WORK") {
    return "/teamoptix/business/contracts/documents/statement-of-work";
  }

  if (item.document_type === "MASTER_SERVICE_AGREEMENT") {
    return "/teamoptix/business/contracts/documents/master-service-agreement";
  }

  return "/teamoptix/business/contracts";
}

function paragraphs(value?: string | null) {
  return (value ?? "")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function taskStatusLabel(task?: LegalTask | null) {
  if (!task) return "Acceptance Stored";
  if (task.status === "EXECUTED_AND_VAULTED") return "Executed & Vaulted";
  if (task.status === "CUSTOMER_ACCEPTED") return "Team Optix Finalization Pending";
  if (task.status === "READY_FOR_CUSTOMER_REVIEW") return "Customer Review Pending";
  return task.status?.replaceAll("_", " ") ?? "Acceptance Stored";
}

export default async function DocumentEvidencePage({ params }: Props) {
  const { vaultItemId } = await params;
  const item = (await getDocumentVaultItem(vaultItemId)) as VaultItem;
  const legalTask = (await getCustomerLegalTaskForVaultItem(vaultItemId)) as LegalTask | null;
  const sections = Array.isArray(item.content_snapshot?.sections)
    ? item.content_snapshot.sections
    : [];

  return (
    <TeamOptixShell>
      <main className="workspace-shell">
        <section className="workspace-main">
          <WorkspaceHeader
            eyebrow="TeamOptix · Compliance Evidence"
            title="Document Evidence Packet"
            description="Printable evidence record for a locked and accepted document version. PDF storage is the next evidence-storage step."
            action={
              <div className="workspace-actions">
                <Link className="secondary-action" href="/teamoptix/business/contracts/vault">
                  Back to Vault
                </Link>
                <Link className="secondary-action" href={documentHref(item)}>
                  Source Document
                </Link>
                <EvidencePrintButton />
              </div>
            }
          />

          <section className="summary-grid evidence-print-hide">
            <WorkspaceSection eyebrow="Document" title={item.document_title ?? "Document"} description={`${item.document_type ?? "Document"} · v${item.version_label ?? "—"}`}>
              <div />
            </WorkspaceSection>
            <WorkspaceSection eyebrow="Accepted" title={formatDate(item.accepted_at)} description={`${item.accepted_by_name ?? "—"} · ${item.accepted_by_email ?? "—"}`}>
              <div />
            </WorkspaceSection>
            <WorkspaceSection eyebrow="Evidence" title={item.storage_status ?? "PDF_PENDING"} description={`Checksum: ${item.checksum ?? "Pending"}`}>
              <div />
            </WorkspaceSection>
            <WorkspaceSection eyebrow="Execution" title={taskStatusLabel(legalTask)} description={`Completed: ${formatDate(legalTask?.completed_at ?? legalTask?.teamoptix_executed_at)}`}>
              <div />
            </WorkspaceSection>
          </section>

          <WorkspaceSection
            eyebrow="Evidence Artifact"
            title="Acceptance Record"
            description="This packet records who accepted which locked document version and preserves the accepted content snapshot."
          >
            <article className="legal-evidence-document">
              <header className="legal-evidence-header">
                <p>Document Type: {item.document_type ?? "—"}</p>
                <p>Document Version: {item.version_label ?? "—"}</p>
                <p>Artifact Status: {item.artifact_status ?? "STORED"}</p>
                <p>Storage Status: {item.storage_status ?? "PDF_PENDING"}</p>
                <p>Accepted By: {item.accepted_by_name ?? "—"}</p>
                <p>Accepted Email: {item.accepted_by_email ?? "—"}</p>
                <p>Accepted Title: {item.accepted_by_title ?? "—"}</p>
                <p>Accepted Company: {item.accepted_by_company ?? "—"}</p>
                <p>Accepted At: {formatDate(item.accepted_at)}</p>
                <p>Team Optix Execution Status: {taskStatusLabel(legalTask)}</p>
                <p>Team Optix Executed At: {formatDate(legalTask?.teamoptix_executed_at)}</p>
                <p>Execution Completed At: {formatDate(legalTask?.completed_at)}</p>
                <p>Execution Evidence: {legalTask?.blocking_reason ?? "—"}</p>
                <p>Checksum: {item.checksum ?? "Pending"}</p>
              </header>

              <hr />

              <h1>{item.content_snapshot?.document?.title ?? item.document_title ?? "Document"}</h1>
              <p>Version {item.content_snapshot?.document?.version_label ?? item.version_label ?? "—"}</p>

              {sections.map((section, index) => (
                <section key={`${section.title ?? "section"}-${index}`} className="legal-evidence-section">
                  <p className="legal-evidence-section-number">Section {section.section_number ?? index + 1}</p>
                  <h2>{section.title ?? "Untitled Section"}</h2>
                  {paragraphs(section.body_markdown).map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </section>
              ))}
            </article>
          </WorkspaceSection>
        </section>
      </main>
    </TeamOptixShell>
  );
}
