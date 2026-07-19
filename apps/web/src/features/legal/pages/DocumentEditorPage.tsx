import TeamOptixShell from "@/features/teamoptix/navigation/TeamOptixShell";
import { DocumentWorkspace } from "@/features/legal/components/DocumentWorkspace";
import { getCustomerWorkspaceSlugForDocument, getDocument, getDocumentVersionAcceptances, getDocumentVersions, getLegalCustomerOptions, getSections } from "@/features/legal/server/legal.repository";

type Props = {
  documentKey: string;
};

export default async function DocumentEditorPage({ documentKey }: Props) {
  const document = await getDocument(documentKey);
  const [sections, versions, acceptances, customerOptions] = await Promise.all([
    getSections(document.id),
    getDocumentVersions(document.id),
    getDocumentVersionAcceptances(document.id),
    getLegalCustomerOptions(),
  ]);
  const customerWorkspaceSlug = await getCustomerWorkspaceSlugForDocument(
    document.id,
    typeof document.customer_company_id === "string" ? document.customer_company_id : null
  );

  return (
    <TeamOptixShell>
      <main className="workspace-shell">
        <section className="workspace-main">
          <DocumentWorkspace
            document={document}
            sections={sections}
            versions={versions}
            acceptances={acceptances}
            customerOptions={customerOptions}
            customerWorkspaceSlug={customerWorkspaceSlug}
            exitHref="/teamoptix/business/contracts"
          />
        </section>
      </main>
    </TeamOptixShell>
  );
}
