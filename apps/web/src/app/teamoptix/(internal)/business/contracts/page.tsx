import Link from "next/link";
import TeamOptixShell from "@/features/teamoptix/navigation/TeamOptixShell";
import { getDocuments } from "@/features/legal/server/legal.repository";
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

export default async function TeamOptixContractsPage() {
  const documents = await getDocuments();
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
            <WorkspaceSection eyebrow="Pulse" title="Missing" description={`${missingCount} planned documents not seeded yet.`}>
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
            <WorkspaceSection eyebrow="Customer Contracts" title="Executed Contracts" description="Customer-specific agreements, signed packages, renewals, and exceptions.">
              <div />
            </WorkspaceSection>
            <WorkspaceSection eyebrow="Templates" title="Clause & Document Templates" description="Reusable contract structures and approved language.">
              <div />
            </WorkspaceSection>
            <WorkspaceSection eyebrow="Package Review" title="Counsel Review Package" description="Assemble MSA, SOW, DPA, AUP, and supporting policies for legal review.">
              <div />
            </WorkspaceSection>
            <WorkspaceSection eyebrow="Archive" title="Published History" description="Immutable published versions and superseded commercial documents.">
              <div />
            </WorkspaceSection>
          </section>
        </section>
      </main>
    </TeamOptixShell>
  );
}
