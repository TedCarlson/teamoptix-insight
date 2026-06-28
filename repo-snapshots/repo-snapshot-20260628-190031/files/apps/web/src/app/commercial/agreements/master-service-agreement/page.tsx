import { loadMasterServiceAgreement } from "@/features/legal/server/msa";
import { MasterServiceAgreementWorkspace } from "@/features/legal/components/MasterServiceAgreementWorkspace";

export const dynamic = "force-dynamic";

export default async function MasterServiceAgreementPage() {
  const { document, sections } = await loadMasterServiceAgreement();

  return (
    <MasterServiceAgreementWorkspace
      document={document}
      sections={sections}
    />
  );
}
