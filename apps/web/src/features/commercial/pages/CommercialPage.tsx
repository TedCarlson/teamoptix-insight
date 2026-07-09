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
            <h1 className="directory-title">Billing Management Center</h1>
            <p className="directory-subtitle">
              Insight owns the commercial relationship. Payment providers collect funds.
            </p>
          </div>

          <div className="cta-row" style={{ marginTop: 0 }}>
            <Link className="button" href="/command-center">
              Back to Command Center
            </Link>
          </div>
        </header>

        <section className="workspace-grid">
          <Link
            href="/teamoptix/business/contracts/agreements"
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <PlatformPillarCard
              eyebrow="Agreements"
              title="Agreement Workspace"
              body="Draft, review, version, and govern customer-facing commercial agreements."
            />
          </Link>

          <PlatformPillarCard eyebrow="Policy" title="Privacy Policy" body="Planned customer privacy obligations and data-use commitments." />
          <PlatformPillarCard eyebrow="Data" title="Data Processing Addendum" body="Planned processing, retention, deletion, and data handling terms." />
          <PlatformPillarCard eyebrow="Security" title="Security Addendum" body="Planned platform security commitments and operating safeguards." />
          <PlatformPillarCard eyebrow="Use" title="Acceptable Use Policy" body="Planned rules governing authorized use of the Insight platform." />
          <PlatformPillarCard eyebrow="Plans" title="Subscription Catalog" body="Planned pricing tiers, modules, and commercial packaging." />
          <PlatformPillarCard eyebrow="Billing" title="Customer Billing" body="Customer subscriptions, invoices, and billing controls." />
          <PlatformPillarCard eyebrow="Policies" title="Billing Policies" body="Grace periods, renewals, suspension, cancellation, and billing rules." />
        </section>
      </section>
    </main>
  );
}
