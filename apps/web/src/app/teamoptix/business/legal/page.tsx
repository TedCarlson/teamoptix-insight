import Link from "next/link";
import TeamOptixShell from "@/features/teamoptix/navigation/TeamOptixShell";

export default function TeamOptixLegalPage() {
  return (
    <TeamOptixShell>
      <main className="workspace-shell">
        <section className="workspace-main">
          <section className="app-card" style={{ padding: 18 }}>
            <p className="value-card__eyebrow">TeamOptix · Business</p>
            <h1 className="workspace-title">Legal</h1>
            <p className="workspace-subtitle">
              Commercial agreements, legal templates, and contract operations.
            </p>
          </section>

          <section className="app-card" style={{ padding: 16 }}>
            <p className="value-card__eyebrow">Active Workspace</p>
            <h2 className="app-card__title">Master Service Agreement</h2>
            <p className="app-card__body">
              Continue editing the MSA workspace without burying it under product placeholders.
            </p>

            <div className="cta-row" style={{ marginTop: 12 }}>
              <Link className="button button-primary" href="/commercial/agreements/master-service-agreement">
                Open MSA Editor
              </Link>

              <Link className="button" href="/commercial/agreements">
                View Agreements
              </Link>
            </div>
          </section>
        </section>
      </main>
    </TeamOptixShell>
  );
}
