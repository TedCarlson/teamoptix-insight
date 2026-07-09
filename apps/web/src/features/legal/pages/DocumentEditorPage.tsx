import TeamOptixShell from "@/features/teamoptix/navigation/TeamOptixShell";
import { DocumentWorkspace } from "@/features/legal/components/DocumentWorkspace";
import { getDocument, getSections } from "@/features/legal/server/legal.repository";

type Props = {
  documentKey: string;
};

export default async function DocumentEditorPage({ documentKey }: Props) {
  const document = await getDocument(documentKey);
  const sections = await getSections(document.id);

  return (
    <TeamOptixShell>
      <main className="workspace-shell">
        <section className="workspace-main">
          <DocumentWorkspace
            document={document}
            sections={sections}
            exitHref="/teamoptix/business/contracts"
          />
        </section>
      </main>
    </TeamOptixShell>
  );
}
