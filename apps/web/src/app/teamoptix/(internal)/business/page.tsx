import TeamOptixWorkspacePage from "@/features/teamoptix/shared/TeamOptixWorkspacePage";
import { businessSections } from "@/features/teamoptix/registry";

export default function Page() {
  return (
    <TeamOptixWorkspacePage
      eyebrow="TeamOptix · Business"
      title="Business"
      description="Sales, marketing, contracts, finance, and growth operations."
      sections={businessSections}
    />
  );
}
