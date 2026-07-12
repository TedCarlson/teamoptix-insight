import AutomationConfigPanel from "@/features/automation/components/AutomationConfigPanel";
import CompanyContractConfigManager from "@/features/company/components/CompanyContractConfigManager";
import CustomerActivationOverview from "@/features/teamoptix/customer-activation/components/CustomerActivationOverview";
import { getCompanyActivationSnapshot } from "@/features/teamoptix/customer-activation/server/customerActivation.server";
import TeamOptixShell from "@/features/teamoptix/navigation/TeamOptixShell";
import {
  WorkspaceHeader,
  WorkspaceSection,
} from "@/features/ui/workspace";

type PageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function TeamOptixCustomerGovernancePage({
  params,
}: PageProps) {
  const { slug } = await params;
  const snapshot = await getCompanyActivationSnapshot(slug);

  return (
    <TeamOptixShell>
      <main className="workspace-shell">
        <section className="workspace-main">
          <WorkspaceHeader
            eyebrow="Team Optix · Customers"
            title={snapshot.company.company_name}
            description="Team Optix governance for customer activation, contracts, terminal scope, and platform-managed automation."
          />

          <WorkspaceSection
            eyebrow="Customer Activation"
            title="Implementation and Go Live"
            description="Review the authoritative customer lifecycle, readiness checklist, billing activation posture, and latest execution state."
          >
            <CustomerActivationOverview
              slug={slug}
              snapshot={snapshot}
            />
          </WorkspaceSection>

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
              workspaceMode="governance"
            />
          </WorkspaceSection>
        </section>
      </main>
    </TeamOptixShell>
  );
}
