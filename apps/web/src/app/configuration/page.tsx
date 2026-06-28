import Link from "next/link";
import SiteHeader from "@/features/landing/components/SiteHeader";
import PlatformPillarCard from "@/features/platform/components/PlatformPillarCard";

export default function ConfigurationPage() {
  return (
    <main className="workspace-shell">
      <SiteHeader />

      <section className="workspace-main">
        <header className="directory-header">
          <div style={{ display: "grid", gap: 8 }}>
            <p className="eyebrow">Platform Configuration</p>
            <h1 className="directory-title">Configuration Center</h1>
            <p className="directory-subtitle">
              Platform behavior belongs here. Customer operations stay inside company workspaces.
            </p>
          </div>

          <div className="cta-row" style={{ marginTop: 0 }}>
            <Link className="button" href="/command-center">
              Back to Command Center
            </Link>
          </div>
        </header>

        <section className="workspace-grid">
          <PlatformPillarCard eyebrow="Catalog" title="Industries & Lines of Business" body="Define the markets and operating models Insight supports." />
          <PlatformPillarCard eyebrow="Modules" title="Feature Flags" body="Control platform capabilities without scattering behavior across customer pages." />
          <PlatformPillarCard eyebrow="Automation" title="Collection Policies" body="Centralize automation rules, templates, and freshness expectations." />
          <PlatformPillarCard eyebrow="System" title="Platform Defaults" body="Branding, notifications, AI providers, retention, and global platform settings." />
        </section>
      </section>
    </main>
  );
}
