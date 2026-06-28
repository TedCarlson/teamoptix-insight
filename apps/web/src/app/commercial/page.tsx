import Link from "next/link";
import SiteHeader from "@/features/landing/components/SiteHeader";
import PlatformPillarCard from "@/features/platform/components/PlatformPillarCard";

export default function CommercialPage() {
  return (
    <main className="workspace-shell">
      <SiteHeader />

      <section className="workspace-main">
        <header className="directory-header">
          <div style={{ display: "grid", gap: 8 }}>
            <p className="eyebrow">Platform Commercial</p>
            <h1 className="directory-title">Commercial Management</h1>
            <p className="directory-subtitle">
              Insight owns the customer relationship. Payment processors execute the payment rules later.
            </p>
          </div>

          <div className="cta-row" style={{ marginTop: 0 }}>
            <Link className="button" href="/command-center">
              Back to Command Center
            </Link>
          </div>
        </header>

        <section className="workspace-grid">
          <PlatformPillarCard eyebrow="Plans" title="Subscription Plans" body="Define packages, tiers, modules, and commercial entitlements." />
          <PlatformPillarCard eyebrow="Trials" title="Trial Management" body="Track trial status, conversion posture, renewal timing, and next actions." />
          <PlatformPillarCard eyebrow="Billing" title="Billing Status" body="Manage what a company owes and the current commercial relationship." />
          <PlatformPillarCard eyebrow="Payments" title="Payment Provider" body="Stripe or another provider will process payments. Insight stores only platform references." />
        </section>
      </section>
    </main>
  );
}
