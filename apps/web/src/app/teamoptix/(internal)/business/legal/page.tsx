import Link from "next/link";
import TeamOptixShell from "@/features/teamoptix/navigation/TeamOptixShell";
import {
  WorkspaceHeader,
  WorkspaceSection,
} from "@/features/ui/workspace";

export default function TeamOptixLegalPage() {
  return (
    <TeamOptixShell>
      <main className="workspace-shell">
        <section className="workspace-main">
          <WorkspaceHeader
            eyebrow="TeamOptix · Business"
            title="Legal"
            description="Commercial agreements, legal templates, and contract operations."
          />

          <WorkspaceSection
            eyebrow="Active Workspace"
            title="Master Service Agreement"
            description="Continue editing the MSA workspace without burying it under product placeholders."
            action={
              <div className="cta-row">
                <Link className="button button-primary" href="/commercial/agreements/master-service-agreement">
                  Open MSA Editor
                </Link>

                <Link className="button" href="/commercial/agreements">
                  View Agreements
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
