import TeamOptixShell from "@/features/teamoptix/navigation/TeamOptixShell";
import CompanyContractConfigManager from "@/features/company/components/CompanyContractConfigManager";
import AutomationConfigPanel from "@/features/automation/components/AutomationConfigPanel";
import {
  WorkspaceHeader,
  WorkspaceSection,
} from "@/features/ui/workspace";

type PageProps = {
  params: Promise<{
    slug: string;
  }>;
};

function customerName(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default async function TeamOptixCustomerGovernancePage({
  params,
}: PageProps) {
  const { slug } = await params;
  const name = customerName(slug);

  return (
    <TeamOptixShell>
      <main className="workspace-shell">
        <section className="workspace-main">
          <WorkspaceHeader
            eyebrow="TeamOptix · Customers"
            title={name}
            description="Team Optix governance for customer contracts, terminal scope, and platform-managed automation."
          />

          <WorkspaceSection
            eyebrow="Customer Governance"
            title="Contracts and operating scope"
            description="Manage the customer contract and terminal facts used to scope operations, reporting, and automation."
          >
            <CompanyContractConfigManager
              slug={slug}
              canEdit
            />
          </WorkspaceSection>

          <WorkspaceSection
            eyebrow="Platform Governance"
            title="Automation"
            description="Manage platform collection controls, schedules, orders, and runtime posture. Customer connection credentials remain customer-managed."
          >
            <AutomationConfigPanel
              slug={slug}
              canEdit
              credentialMode="status_only"
            />
          </WorkspaceSection>
        </section>
      </main>
    </TeamOptixShell>
  );
}
