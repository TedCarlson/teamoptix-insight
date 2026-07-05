import TeamOptixWorkspacePage from "@/features/teamoptix/shared/TeamOptixWorkspacePage";
import { customerSections } from "@/features/teamoptix/registry";

export default function Page() {
  return (
    <TeamOptixWorkspacePage
      eyebrow="TeamOptix · Customers"
      title="Customers"
      description="Manage customer accounts, health, priorities, and launches."
      sections={customerSections}
    />
  );
}
