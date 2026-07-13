import TeamOptixShell from "@/features/teamoptix/navigation/TeamOptixShell";
import { DocumentWorkspace } from "@/features/legal/components/DocumentWorkspace";
import { getDocument, getDocumentVersionAcceptances, getDocumentVersions, getSections } from "@/features/legal/server/legal.repository";

type Props = {
  documentKey: string;
};

export default async function DocumentEditorPage({ documentKey }: Props) {
  const document = await getDocument(documentKey);
  const sections = await getSections(document.id);
  const versions = await getDocumentVersions(document.id);
  const acceptances = await getDocumentVersionAcceptances(document.id);

  return (
    <TeamOptixShell>
      <main className="workspace-shell">
        <section className="workspace-main">
          <DocumentWorkspace
            document={document}
            sections={sections}
            versions={versions}
            acceptances={acceptances}
            exitHref="/teamoptix/business/contracts"
          />
        </section>
      </main>
    </TeamOptixShell>
  );
}
