import Link from "next/link";
import SiteHeader from "@/features/landing/components/SiteHeader";
import { MasterServiceAgreementWorkspace } from "@/features/legal/components/MasterServiceAgreementWorkspace";
import { loadMasterServiceAgreement } from "@/features/legal/server/msa";

export default async function MasterServiceAgreementPage() {
  const { document, sections } = await loadMasterServiceAgreement();

  return (
    <main className="workspace-shell">
      <SiteHeader />

      <section className="workspace-main">
        <header className="directory-header">
          <div>
            <p className="eyebrow">Commercial Agreements</p>
            <h1 className="directory-title">Master Service Agreement</h1>
            <p className="directory-subtitle">
              Read, review, and govern the customer-facing agreement body from one document workspace.
            </p>
          </div>

          <Link className="button" href="/commercial/agreements">
            Back to Agreements
          </Link>
        </header>

        <MasterServiceAgreementWorkspace document={document} sections={sections} />
      </section>
    </main>
  );
}
