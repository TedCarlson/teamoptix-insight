import Link from "next/link";
import TeamOptixShell from "@/features/teamoptix/navigation/TeamOptixShell";
import { getClientDocuments, getCustomerLegalTasks, getTemplateDocuments } from "@/features/legal/server/legal.repository";

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

function statusClass(status: string) {
  const normalized = normalizedStatus(status);
  if (["PUBLISHED", "EXECUTED", "EXECUTED_AND_VAULTED"].includes(normalized)) return " signal-pill--healthy";
  if (["CUSTOMER ACTION", "TEAM OPTIX", "VAULTING", "READY_FOR_CUSTOMER_REVIEW", "CUSTOMER_ACCEPTED"].includes(normalized)) return " signal-pill--degraded";
  if (["CANCELLED", "SUPERSEDED"].includes(normalized)) return " signal-pill--unknown";
  return "";
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
      <main className="workspace-shell teamoptix-domain-overview contracts-workspace">
        <section className="workspace-main">
          <header className="domain-heading">
            <p className="eyebrow">TeamOptix · Business · Contracts</p>
            <h1>Contracts</h1>
            <p>Commercial documents, customer agreements, execution readiness, and governed legal evidence.</p>
          </header>

          <section className="operating-pulse domain-pulse" aria-label="Contract operating pulse">
            <article><span>Document Library</span><strong>{rows.length}</strong><small>{missingCount ? `${missingCount} not started` : "All templates established"}</small></article>
            <article><span>Draft Templates</span><strong>{draftCount}</strong><small>{publishedCount} published</small></article>
            <article><span>Customer Contracts</span><strong>{actionableClientDocuments.length}</strong><small>{clientCount} total · {archivedClientDocuments.length} archived</small></article>
            <article><span>Open Legal Tasks</span><strong>{openLegalTaskCount}</strong><small>{openLegalTaskCount ? "Execution work remains" : "Execution queue clear"}</small></article>
          </section>

          <section className="domain-panel-grid contracts-panel-grid">
            <article className="command-panel domain-panel contracts-panel--primary">
              <div className="command-panel__header">
                <div><p className="value-card__eyebrow">Customer Contracts</p><h2>Execution queue</h2></div>
                <Link href="/teamoptix/business/contracts/tasks">All tasks →</Link>
              </div>
              <div className="domain-row-list">
                {actionableClientDocuments.length ? (
                  actionableClientDocuments.map((document: Record<string, unknown>) => (
                    <Link
                      key={String(document.id)}
                      className="domain-row"
                      href={`/teamoptix/business/contracts/client-documents/${encodeURIComponent(String(document.document_key))}`}
                    >
                      <span>
                        <strong>{String(document.title ?? "Client Document")}</strong>
                        <small>{String(document.customer_legal_name ?? "Customer document")} · v{version(document)}</small>
                      </span>
                      <em className={`signal-pill${statusClass(customerDocumentDisplayStatus(document, legalTasks))}`}>{customerDocumentDisplayStatus(document, legalTasks)}</em>
                      <b aria-hidden="true">→</b>
                    </Link>
                  ))
                ) : (
                  <div className="command-empty">
                    <strong>No actionable customer contracts</strong>
                    <span>Create a customer document from a locked template to begin the execution lane.</span>
                  </div>
                )}
                <Link
                  className="domain-row"
                  href="/teamoptix/business/contracts/vault"
                >
                  <span>
                    <strong>Document Vault</strong>
                    <small>Accepted versions, signer records, timestamps, and evidence artifacts.</small>
                  </span>
                  <em className="signal-pill">Open</em><b aria-hidden="true">→</b>
                </Link>
                <Link
                  className="domain-row"
                  href="/teamoptix/business/contracts/tasks"
                >
                  <span>
                    <strong>Customer Legal Tasks</strong>
                    <small>Customer review, acceptance, finalization, and Go Live legal readiness.</small>
                  </span>
                  <em className={`signal-pill${openLegalTaskCount ? " signal-pill--degraded" : " signal-pill--healthy"}`}>{openLegalTaskCount ? `${openLegalTaskCount} Open` : "Ready"}</em><b aria-hidden="true">→</b>
                </Link>
              </div>
            </article>

            <article className="command-panel domain-panel">
              <div className="command-panel__header">
                <div><p className="value-card__eyebrow">Document Library</p><h2>Governed templates</h2></div>
                <span>{rows.length} documents</span>
              </div>
              <div className="domain-row-list">
                {rows.map((row) => (
                  <Link
                    key={row.key}
                    className="domain-row"
                    href={row.href}
                  >
                    <span>
                      <strong>{row.title}</strong>
                      <small>{row.type} · v{row.version}</small>
                    </span>
                    <em className={`signal-pill${statusClass(row.status)}`}>{row.status}</em><b aria-hidden="true">→</b>
                  </Link>
                ))}
              </div>
            </article>

            <article className="command-panel domain-panel">
              <div className="command-panel__header">
                <div><p className="value-card__eyebrow">Archive</p><h2>Superseded history</h2></div>
                <Link href="/teamoptix/business/contracts/vault">Open vault →</Link>
              </div>
              <div className="domain-row-list">
                {archivedClientDocuments.length ? (
                  archivedClientDocuments.map((document: Record<string, unknown>) => (
                    <Link
                      key={`archived-${String(document.id)}`}
                      className="domain-row"
                      href={`/teamoptix/business/contracts/client-documents/${encodeURIComponent(String(document.document_key))}`}
                    >
                      <span>
                        <strong>{String(document.title ?? "Client Document")}</strong>
                        <small>{String(document.customer_legal_name ?? "Customer document")} · v{version(document)}</small>
                      </span>
                      <em className={`signal-pill${statusClass(customerDocumentDisplayStatus(document, legalTasks))}`}>{customerDocumentDisplayStatus(document, legalTasks)}</em><b aria-hidden="true">→</b>
                    </Link>
                  ))
                ) : (
                  <div className="command-empty">
                    <strong>No archived customer contracts</strong>
                    <span>Superseded and cancelled documents will appear here without crowding the active queue.</span>
                  </div>
                )}
              </div>
            </article>

            <article className="command-panel domain-panel contracts-package-panel">
              <div className="command-panel__header">
                <div><p className="value-card__eyebrow">Package Review</p><h2>Counsel review package</h2></div>
              </div>
              <p className="contracts-package-panel__copy">Assemble the MSA, SOW, DPA, AUP, and supporting evidence into one governed review package.</p>
              <div className="contracts-package-panel__readiness">
                <span>Library readiness</span><strong>{rows.length - missingCount} / {rows.length}</strong>
                <i><b style={{ width: `${rows.length ? ((rows.length - missingCount) / rows.length) * 100 : 0}%` }} /></i>
              </div>
            </article>
          </section>
        </section>
      </main>
    </TeamOptixShell>
  );
}
