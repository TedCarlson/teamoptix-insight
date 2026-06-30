import Link from "next/link";
import TeamOptixShell from "@/features/teamoptix/navigation/TeamOptixShell";
import { WorkspaceHeader, WorkspaceSection } from "@/features/ui/workspace";

export default function TeamOptixInsightProductPage() {
  return (
    <TeamOptixShell>
      <main className="workspace-shell">
        <section className="workspace-main">
          <WorkspaceHeader
            eyebrow="TeamOptix · Products"
            title="Insight"
            description="Customer operating platform. Use this page to launch customer workspaces and inspect development surfaces."
          />

          <WorkspaceSection
            eyebrow="Launch"
            title="Customer Workspaces"
            description="Open Insight company workspaces for development oversight and client review."
            action={
              <div className="cta-row">
                <Link className="button button-primary" href="/companies">
                  View Companies
                </Link>
                <Link className="button" href="/company/beacon-point-ventures/home">
                  Open Beacon Point
                </Link>
              </div>
            }
          >
            <div />
          </WorkspaceSection>

          <WorkspaceSection
            eyebrow="Product Surface"
            title="Commercial / Legal"
            description="Access the commercial agreement surfaces currently attached to Insight."
            action={
              <div className="cta-row">
                <Link className="button" href="/commercial/agreements">
                  Agreements
                </Link>
                <Link className="button" href="/commercial/agreements/master-service-agreement">
                  MSA Editor
                </Link>
              </div>
            }
          >
            <div />
          </WorkspaceSection>
        </section>
      </main>
    </TeamOptixShell>
  );
}
