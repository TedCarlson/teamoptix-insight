import TeamOptixWorkspacePage from "@/features/teamoptix/shared/TeamOptixWorkspacePage";
import { automationSections } from "@/features/teamoptix/registry";

export default function Page() {
  return (
    <TeamOptixWorkspacePage
      eyebrow="TeamOptix · Automation"
      title="Automation"
      description="Runner fleet, collections, jobs, and telemetry."
      sections={automationSections}
    />
  );
}
