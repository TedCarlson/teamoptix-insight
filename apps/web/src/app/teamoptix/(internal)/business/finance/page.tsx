import Link from "next/link";
import TeamOptixShell from "@/features/teamoptix/navigation/TeamOptixShell";
import { WorkspaceHeader, WorkspaceSection } from "@/features/ui/workspace";

const financeAreas = [
  {
    eyebrow: "Banking",
    title: "Banking",
    description: "Business accounts, deposits, cash posture, and bank connection readiness.",
    href: "/teamoptix/business/finance/banking",
  },
  {
    eyebrow: "Billing",
    title: "Billing",
    description: "Customers, subscriptions, invoices, payments, plans, and billing provider state.",
    href: "/teamoptix/business/finance/billing",
  },
  {
    eyebrow: "Accounting",
    title: "Accounting",
    description: "Ledger posture, chart of accounts, bookkeeping workflow, and accounting exports.",
    href: "/teamoptix/business/finance/accounting",
  },
  {
    eyebrow: "Revenue",
    title: "Revenue",
    description: "MRR, ARR, customer revenue, pricing posture, and revenue capture.",
    href: "/teamoptix/business/finance/revenue",
  },
  {
    eyebrow: "Expenses",
    title: "Expenses",
    description: "Operating spend, vendor costs, software subscriptions, and expense tracking.",
    href: "/teamoptix/business/finance/expenses",
  },
  {
    eyebrow: "Reporting",
    title: "Reporting",
    description: "Financial reports, owner summaries, exports, and operating financial snapshots.",
    href: "/teamoptix/business/finance/reporting",
  },
];

export default function FinancePage() {
  return (
    <TeamOptixShell>
      <main className="workspace-shell">
        <section className="workspace-main">

          <section className="summary-grid">
            <WorkspaceSection eyebrow="Pulse" title="Billing" description="Stripe foundation not connected yet.">
              <div />
            </WorkspaceSection>
            <WorkspaceSection eyebrow="Pulse" title="Accounting" description="Ledger workflow not connected yet.">
              <div />
            </WorkspaceSection>
            <WorkspaceSection eyebrow="Pulse" title="Banking" description="Business bank account tracking ready for setup.">
              <div />
            </WorkspaceSection>
          </section>

          <WorkspaceSection
            eyebrow="Workspace"
            title="Finance"
            description="Select a workspace below."
          >
            <div className="signal-list">
              {financeAreas.map((area) => (
                <Link
                  key={area.href}
                  className="signal-list__row"
                  href={area.href}
                  style={{ color: "inherit", textDecoration: "none" }}
                >
                  <div>
                    <strong>{area.title}</strong>
                    <span>{area.description}</span>
                  </div>
                  <em>Open</em>
                </Link>
              ))}
            </div>
          </WorkspaceSection>
        </section>
      </main>
    </TeamOptixShell>
  );
}
