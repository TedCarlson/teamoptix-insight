import TeamOptixWorkspacePage from "@/features/teamoptix/shared/TeamOptixWorkspacePage";
import { engineeringSections } from "@/features/teamoptix/registry";

export default function Page() {
  return (
    <TeamOptixWorkspacePage
      eyebrow="TeamOptix · Engineering"
      title="Engineering"
      description="Repositories, releases, deployment health, and technical debt."
      sections={engineeringSections}
    />
  );
}
