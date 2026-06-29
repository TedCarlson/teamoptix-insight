import TeamOptixWorkspacePage from "@/features/teamoptix/shared/TeamOptixWorkspacePage";
import { productSections } from "@/features/teamoptix/registry";

export default function Page() {
  return (
    <TeamOptixWorkspacePage
      eyebrow="TeamOptix · Products"
      title="Products"
      description="Manage TeamOptix products and launch surfaces."
      sections={productSections}
    />
  );
}
