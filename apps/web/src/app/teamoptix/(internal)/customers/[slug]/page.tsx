import AutomationConfigPanel from "@/features/automation/components/AutomationConfigPanel";
import CompanyContractConfigManager from "@/features/company/components/CompanyContractConfigManager";
import CustomerActivationOverview from "@/features/teamoptix/customer-activation/components/CustomerActivationOverview";
import { getCompanyActivationSnapshot } from "@/features/teamoptix/customer-activation/server/customerActivation.server";
import TeamOptixShell from "@/features/teamoptix/navigation/TeamOptixShell";

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
      <main className="workspace-shell teamoptix-domain-overview customer-governance-workspace">
        <section className="workspace-main">
          <header className="domain-heading">
            <p className="eyebrow">TeamOptix · Customers · Governance</p>
            <h1>{snapshot.company.company_name}</h1>
            <p>Activation truth, legal execution, operating scope, and platform-managed automation.</p>
          </header>

          <CustomerActivationOverview slug={slug} snapshot={snapshot} />

          <details className="command-panel governance-domain-disclosure">
            <summary>
              <span><small>Customer Governance</small><strong>Contracts and operating scope</strong></span>
              <em>Manage configuration</em>
            </summary>
            <div className="governance-domain-disclosure__body">
              <CompanyContractConfigManager slug={slug} canEdit />
            </div>
          </details>

          <details className="command-panel governance-domain-disclosure">
            <summary>
              <span><small>Platform Governance</small><strong>Automation and collection</strong></span>
              <em>Manage operations</em>
            </summary>
            <div className="governance-domain-disclosure__body">
              <AutomationConfigPanel
                slug={slug}
                canEdit
                credentialMode="status_only"
                workspaceMode="governance"
              />
            </div>
          </details>
        </section>
      </main>
    </TeamOptixShell>
  );
}
