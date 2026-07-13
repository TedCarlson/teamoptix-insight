import Link from "next/link";
import TeamOptixShell from "@/features/teamoptix/navigation/TeamOptixShell";
import { getClientDocuments, getCustomerLegalTasks, getTemplateDocuments } from "@/features/legal/server/legal.repository";
import { WorkspaceHeader, WorkspaceSection } from "@/features/ui/workspace";

export const dynamic = "force-dynamic";

const commercialDocuments = [
  {
    key: "MASTER_SERVICE_AGREEMENT",
    title: "Master Service Agreement",
    href: "/teamoptix/business/contracts/documents/master-service-agreement",
    type: "Agreement",
  },
  {
    key: "STATEMENT_OF_WORK",
    title: "Statement of Work",
    href: "/teamoptix/business/contracts/documents/statement-of-work",
    type: "Addendum",
  },
  {
    key: "DATA_PROCESSING_ADDENDUM",
    title: "Data Processing Addendum",
    href: "/teamoptix/business/contracts/documents/data-processing-addendum",
    type: "Addendum",
  },
  {
    key: "ACCEPTABLE_USE_POLICY",
    title: "Acceptable Use Policy",
    href: "/teamoptix/business/contracts/documents/acceptable-use-policy",
    type: "Policy",
  },
];

function value(row: Record<string, unknown> | undefined, key: string) {
  const raw = row?.[key];
  return typeof raw === "string" || typeof raw === "number" ? String(raw) : null;
}

function version(row: Record<string, unknown> | undefined) {
  if (!row) return "—";
  const currentVersion = value(row, "current_version");
  if (currentVersion) return currentVersion;

  const major = value(row, "version_major") ?? "0";
  const minor = value(row, "version_minor") ?? "1";
  const patch = value(row, "version_patch") ?? "0";

  return `${major}.${minor}.${patch}`;
}


function normalizedStatus(input: unknown) {
  return String(input ?? "").trim().toUpperCase();
}

function taskForDocument(
  document: Record<string, unknown>,
  legalTasks: Array<Record<string, unknown>>
) {
  const documentId = String(document.id ?? "");
  const documentKey = String(document.document_key ?? "");

  return legalTasks.find((task) => {
    return (
      String(task.document_id ?? "") === documentId ||
      String(task.document_key ?? "") === documentKey
    );
  });
}

function customerDocumentDisplayStatus(
  document: Record<string, unknown>,
  legalTasks: Array<Record<string, unknown>>
) {
  const documentStatus = normalizedStatus(document.status);
  const taskStatus = normalizedStatus(taskForDocument(document, legalTasks)?.status);

  if (documentStatus === "SUPERSEDED") return "SUPERSEDED";
  if (documentStatus === "CANCELLED") return "CANCELLED";
  if (taskStatus === "READY_FOR_CUSTOMER_REVIEW") return "CUSTOMER ACTION";
  if (taskStatus === "CUSTOMER_ACCEPTED") return "TEAM OPTIX";
  if (taskStatus === "TEAMOPTIX_EXECUTED") return "VAULTING";
  if (taskStatus === "EXECUTED_AND_VAULTED") return "EXECUTED";

  return documentStatus || "DRAFT";
}

function isArchivedClientDocument(document: Record<string, unknown>) {
  const status = normalizedStatus(document.status);
  return status === "SUPERSEDED" || status === "CANCELLED";
}

export default async function TeamOptixContractsPage() {
  const documents = await getTemplateDocuments();
  const clientDocuments = await getClientDocuments();
  const legalTasks = await getCustomerLegalTasks();
  const byKey = new Map(
    documents.map((document: Record<string, unknown>) => [String(document.document_key), document])
  );

  const rows = commercialDocuments.map((item) => {
    const document = byKey.get(item.key);
    return {
      ...item,
      status: value(document, "status") ?? "Not started",
      version: version(document),
      document,
    };
  });

  const draftCount = rows.filter((row) => row.status.toLowerCase().includes("draft")).length;
  const publishedCount = rows.filter((row) => row.status.toLowerCase().includes("published")).length;
  const missingCount = rows.filter((row) => !row.document).length;
  const clientCount = clientDocuments.length;
  const actionableClientDocuments = clientDocuments.filter(
    (document: Record<string, unknown>) => !isArchivedClientDocument(document)
  );
  const archivedClientDocuments = clientDocuments.filter(
    (document: Record<string, unknown>) => isArchivedClientDocument(document)
  );
  const openLegalTaskCount = legalTasks.filter((task: Record<string, unknown>) => {
    const status = String(task.status ?? "");
    return status !== "EXECUTED_AND_VAULTED" && status !== "CANCELLED";
  }).length;

  return (
    <TeamOptixShell>
      <main className="workspace-shell">
        <section className="workspace-main">
          <WorkspaceHeader
            eyebrow="TeamOptix · Business"
            title="Contracts"
            description="Commercial document lifecycle, customer contracts, templates, and legal package readiness."
          />

          <section className="summary-grid">
            <WorkspaceSection eyebrow="Pulse" title="Draft" description={`${draftCount} commercial documents in draft.`}>
              <div />
            </WorkspaceSection>
            <WorkspaceSection eyebrow="Pulse" title="Published" description={`${publishedCount} commercial documents published.`}>
              <div />
            </WorkspaceSection>
            <WorkspaceSection eyebrow="Pulse" title="Legal Tasks" description={`${openLegalTaskCount} open legal task${openLegalTaskCount === 1 ? "" : "s"}; ${clientCount} client document${clientCount === 1 ? "" : "s"}.`}>
              <div />
            </WorkspaceSection>
          </section>

          <WorkspaceSection
            eyebrow="Agreements"
            title="Commercial Documents"
            description="Open any document into the shared document workspace."
          >
            <div className="signal-list">
              {rows.map((row) => (
                <Link
                  key={row.key}
                  className="signal-list__row"
                  href={row.href}
                  style={{ color: "inherit", textDecoration: "none" }}
                >
                  <div>
                    <strong>{row.title}</strong>
                    <span>{row.type} · v{row.version}</span>
                  </div>
                  <em>{row.status}</em>
                </Link>
              ))}
            </div>
          </WorkspaceSection>

          <section className="workspace-grid">
            <WorkspaceSection eyebrow="Customer Contracts" title="Actionable Contracts" description="Current customer agreements that are draft, released for review, accepted, or awaiting Team Optix finalization.">
              <div className="signal-list">
                {actionableClientDocuments.length ? (
                  actionableClientDocuments.map((document: Record<string, unknown>) => (
                    <Link
                      key={String(document.id)}
                      className="signal-list__row"
                      href={`/teamoptix/business/contracts/client-documents/${encodeURIComponent(String(document.document_key))}`}
                      style={{ color: "inherit", textDecoration: "none" }}
                    >
                      <div>
                        <strong>{String(document.title ?? "Client Document")}</strong>
                        <span>{String(document.customer_legal_name ?? "Customer document")} · v{version(document)}</span>
                      </div>
                      <em>{customerDocumentDisplayStatus(document, legalTasks)}</em>
                    </Link>
                  ))
                ) : (
                  <div className="signal-list__row">
                    <div>
                      <strong>No actionable customer documents</strong>
                      <span>Create a customer document from a locked template, or open the task queue.</span>
                    </div>
                    <em>Ready</em>
                  </div>
                )}

                <Link
                  className="signal-list__row"
                  href="/teamoptix/business/contracts/vault"
                  style={{ color: "inherit", textDecoration:"none" }}
                >
                  <div>
                    <strong>Document Vault</strong>
                    <span>Accepted versions, signer records, timestamps, and evidence artifact status.</span>
                  </div>
                  <em>Open</em>
                </Link>

                <Link
                  className="signal-list__row"
                  href="/teamoptix/business/contracts/tasks"
                  style={{ color: "inherit", textDecoration:"none" }}
                >
                  <div>
                    <strong>Customer Legal Tasks</strong>
                    <span>Customer review, acceptance, Team Optix finalization, and Go Live legal readiness.</span>
                  </div>
                  <em>{openLegalTaskCount ? `${openLegalTaskCount} Open` : "Ready"}</em>
                </Link>
              </div>
            </WorkspaceSection>

            <WorkspaceSection eyebrow="Templates" title="Clause & Document Templates" description="Reusable contract structures and approved language. Open a template, lock a version, then create customer documents from it.">
              <div className="signal-list">
                {rows.map((row) => (
                  <Link
                    key={`template-${row.key}`}
                    className="signal-list__row"
                    href={row.href}
                    style={{ color: "inherit", textDecoration: "none" }}
                  >
                    <div>
                      <strong>{row.title}</strong>
                      <span>Template · v{row.version}</span>
                    </div>
                    <em>{row.status}</em>
                  </Link>
                ))}
              </div>
            </WorkspaceSection>
            <WorkspaceSection eyebrow="Package Review" title="Counsel Review Package" description="Assemble MSA, SOW, DPA, AUP, and supporting policies for legal review.">
              <div />
            </WorkspaceSection>
            <WorkspaceSection eyebrow="Archive" title="Superseded History" description="Superseded, cancelled, and historical customer contract records.">
              <div className="signal-list">
                {archivedClientDocuments.length ? (
                  archivedClientDocuments.map((document: Record<string, unknown>) => (
                    <Link
                      key={`archived-${String(document.id)}`}
                      className="signal-list__row"
                      href={`/teamoptix/business/contracts/client-documents/${encodeURIComponent(String(document.document_key))}`}
                      style={{ color: "inherit", textDecoration: "none" }}
                    >
                      <div>
                        <strong>{String(document.title ?? "Client Document")}</strong>
                        <span>{String(document.customer_legal_name ?? "Customer document")} · v{version(document)}</span>
                      </div>
                      <em>{customerDocumentDisplayStatus(document, legalTasks)}</em>
                    </Link>
                  ))
                ) : (
                  <div className="signal-list__row">
                    <div>
                      <strong>No archived customer documents</strong>
                      <span>Superseded and cancelled client documents will appear here.</span>
                    </div>
                    <em>Empty</em>
                  </div>
                )}
              </div>
            </WorkspaceSection>
          </section>
        </section>
      </main>
    </TeamOptixShell>
  );
}
