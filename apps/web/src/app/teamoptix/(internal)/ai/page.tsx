import TeamOptixWorkspacePage from "@/features/teamoptix/shared/TeamOptixWorkspacePage";
import { aiSections } from "@/features/teamoptix/registry";

export default function Page() {
  return (
    <TeamOptixWorkspacePage
      eyebrow="TeamOptix · AI"
      title="AI"
      description="Assistants, prompts, evaluations, and operating intelligence."
      sections={aiSections}
    />
  );
}
