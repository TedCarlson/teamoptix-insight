import { loadMasterServiceAgreement } from "@/features/legal/server/msa";
import { MasterServiceAgreementWorkspace } from "@/features/legal/components/MasterServiceAgreementWorkspace";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function MasterServiceAgreementPage() {
  const { document, sections } = await loadMasterServiceAgreement();

  return (
    <main className="workspace-shell">
      {/* 🧭 BACK TO COMMERCIAL (critical missing spine) */}
      <section className="workspace-main">
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <p className="eyebrow">Commercial Agreements</p>
            
          </div>

          <Link className="button" href="/commercial">
            ← Back to Commercial
          </Link>
        </header>

        {/* workspace body stays intact */}
        <MasterServiceAgreementWorkspace
          document={document}
          sections={sections}
        />
      </section>
    </main>
  );
}
