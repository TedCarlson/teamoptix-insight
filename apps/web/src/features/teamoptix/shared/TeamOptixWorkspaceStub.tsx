import TeamOptixShell from "@/features/teamoptix/navigation/TeamOptixShell";
import {
  WorkspaceHeader,
  WorkspaceSection,
} from "@/features/ui/workspace";

type TeamOptixWorkspaceStubProps = {
  eyebrow: string;
  title: string;
  description: string;
};

export default function TeamOptixWorkspaceStub(props: TeamOptixWorkspaceStubProps) {
  return (
    <TeamOptixShell>
      <main className="workspace-shell">
        <section className="workspace-main">
          <WorkspaceHeader
            eyebrow={props.eyebrow}
            title={props.title}
            description={props.description}
          />

          <WorkspaceSection
            eyebrow="Workspace"
            title="Foundation ready"
            description="This workspace is scaffolded and ready for the next focused pass."
          >
            <div />
          </WorkspaceSection>
        </section>
      </main>
    </TeamOptixShell>
  );
}
