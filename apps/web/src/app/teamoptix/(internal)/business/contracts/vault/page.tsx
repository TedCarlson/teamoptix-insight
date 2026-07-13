import Link from "next/link";
import TeamOptixShell from "@/features/teamoptix/navigation/TeamOptixShell";
import { getDocumentVaultItems } from "@/features/legal/server/legal.repository";
import { WorkspaceHeader, WorkspaceSection } from "@/features/ui/workspace";

export const dynamic = "force-dynamic";

type VaultItem = {
  id: string;
  document_id?: string | null;
  document_version_id?: string | null;
  acceptance_id?: string | null;
  company_name?: string | null;
  document_type?: string | null;
  document_title?: string | null;
  version_label?: string | null;
  artifact_status?: string | null;
  storage_status?: string | null;
  accepted_by_name?: string | null;
  accepted_by_email?: string | null;
  accepted_by_title?: string | null;
  accepted_by_company?: string | null;
  accepted_at?: string | null;
  pdf_storage_path?: string | null;
  checksum?: string | null;
  content_snapshot?: {
    sections?: Array<{
      title?: string | null;
      body_markdown?: string | null;
    }>;
  } | null;
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
  const type = item.document_type ?? "";
  if (type === "STATEMENT_OF_WORK") {
    return "/teamoptix/business/contracts/documents/statement-of-work";
  }
  if (type === "MASTER_SERVICE_AGREEMENT") {
    return "/teamoptix/business/contracts/documents/master-service-agreement";
  }
  return "/teamoptix/business/contracts";
}

function unresolvedPlaceholderCount(item: VaultItem) {
  const sections = Array.isArray(item.content_snapshot?.sections)
    ? item.content_snapshot.sections
    : [];
  const joined = sections
    .map((section) => `${section.title ?? ""}\n${section.body_markdown ?? ""}`)
    .join("\n");
  const matches = joined.match(/\[[^\]\n]+\]/g) ?? [];
  return new Set(matches).size;
}

export default async function TeamOptixDocumentVaultPage() {
  const items = (await getDocumentVaultItems()) as VaultItem[];
  const storedCount = items.filter((item) => item.artifact_status === "STORED").length;
  const pdfPendingCount = items.filter((item) => item.storage_status !== "PDF_STORED").length;
  const unresolvedCount = items.reduce((sum, item) => sum + unresolvedPlaceholderCount(item), 0);

  return (
    <TeamOptixShell>
      <main className="workspace-shell">
        <section className="workspace-main">
          <WorkspaceHeader
            eyebrow="TeamOptix · Business · Contracts"
            title="Document Vault"
            description="Internal compliance record of accepted document versions, signer metadata, acceptance timestamps, and future evidence artifacts."
          />

          <section className="summary-grid">
            <WorkspaceSection eyebrow="Vault" title="Stored" description={`${storedCount} accepted artifacts stored.`}>
              <div />
            </WorkspaceSection>
            <WorkspaceSection eyebrow="Evidence" title="PDF Pending" description={`${pdfPendingCount} artifacts awaiting PDF evidence.`}>
              <div />
            </WorkspaceSection>
            <WorkspaceSection eyebrow="Readiness" title="Unresolved Fields" description={`${unresolvedCount} placeholder fields detected across stored snapshots.`}>
              <div />
            </WorkspaceSection>
          </section>

          <WorkspaceSection
            eyebrow="Compliance"
            title="Accepted Document Artifacts"
            description="Who accepted what, which locked version they accepted, and when the acceptance was recorded."
          >
            <div className="signal-list">
              {items.length ? (
                items.map((item) => {
                  const unresolved = unresolvedPlaceholderCount(item);
                  return (
                    <Link
                      key={item.id}
                      className="signal-list__row"
                      href={`/teamoptix/business/contracts/vault/${item.id}/evidence`}
                      style={{ color: "inherit", textDecoration: "none" }}
                    >
                      <div>
                        <strong>{item.document_title ?? "Document"}</strong>
                        <span>
                          {item.document_type ?? "Document"} · v{item.version_label ?? "—"} · {item.storage_status ?? "METADATA_ONLY"}
                        </span>
                        <span>
                          Accepted by {item.accepted_by_name ?? "—"} ({item.accepted_by_email ?? "—"}) · {formatDate(item.accepted_at)}
                        </span>
                        <span>
                          {item.accepted_by_company ?? item.company_name ?? "No company recorded"}
                          {item.accepted_by_title ? ` · ${item.accepted_by_title}` : ""}
                        </span>
                        {unresolved ? (
                          <span>{unresolved} unresolved placeholder field{unresolved === 1 ? "" : "s"}</span>
                        ) : null}
                      </div>
                      <em>{item.storage_status ?? item.artifact_status ?? "STORED"}</em>
                    </Link>
                  );
                })
              ) : (
                <div className="signal-list__row">
                  <div>
                    <strong>No accepted documents yet</strong>
                    <span>Accepted locked versions will appear here after Read & Accept is completed.</span>
                  </div>
                  <em>Empty</em>
                </div>
              )}
            </div>
          </WorkspaceSection>
        </section>
      </main>
    </TeamOptixShell>
  );
}
