import TeamOptixShell from "@/features/teamoptix/navigation/TeamOptixShell";
import { WorkspaceHeader, WorkspaceSection } from "@/features/ui/workspace";

export default function TeamOptixLegalPage() {
  return (
    <TeamOptixShell>
      <main className="workspace-shell">
        <section className="workspace-main">
          <WorkspaceHeader
            eyebrow="TeamOptix · Business"
            title="Legal"
            description="Entity governance, registrations, insurance, compliance, and internal policy operations."
          />

          <section className="workspace-grid">
            {[
              ["Corporate Governance", "Company records, resolutions, ownership posture, and governance decisions."],
              ["LLC", "Formation documents, state records, and entity maintenance."],
              ["Registered Agent", "Registered agent records, address posture, and change tracking."],
              ["EIN", "IRS confirmation, tax identity, and federal entity records."],
              ["Insurance", "Business insurance records, renewals, and coverage posture."],
              ["Compliance", "Internal compliance obligations and operating requirements."],
              ["Policies", "Internal company policies and administrative standards."],
            ].map(([title, body]) => (
              <WorkspaceSection key={title} eyebrow="Legal" title={title} description={body}>
                <div />
              </WorkspaceSection>
            ))}
          </section>
        </section>
      </main>
    </TeamOptixShell>
  );
}
