import TeamOptixWorkspacePage from "@/features/teamoptix/shared/TeamOptixWorkspacePage";
import { projectSections } from "@/features/teamoptix/registry";

export default function Page() {
  return (
    <TeamOptixWorkspacePage
      eyebrow="TeamOptix · Projects"
      title="Projects"
      description="Organize active work across products, presentations, sales, and delivery."
      sections={projectSections}
    />
  );
}
