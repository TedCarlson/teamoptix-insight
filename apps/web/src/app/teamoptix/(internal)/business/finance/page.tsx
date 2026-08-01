import Link from "next/link";
import TeamOptixShell from "@/features/teamoptix/navigation/TeamOptixShell";
import { getFinanceBillingSnapshot } from "@/features/teamoptix/finance/financeBilling.server";
import { WorkspaceSection } from "@/features/ui/workspace";

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
    description: "Customer billing, invoices, receivables, payments, and billing operations.",
    href: "/teamoptix/business/finance/billing",
  },

  {
    eyebrow: "Stripe",
    title: "Stripe",
    description: "Stripe provider administration, catalog, customers, subscriptions, and webhooks.",
    href: "/teamoptix/business/finance/billing-stripe",
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

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export default async function FinancePage() {
  const billing = await getFinanceBillingSnapshot();

  return (
    <TeamOptixShell>
      <main className="workspace-shell">
        <section className="workspace-main">

          <section className="summary-grid">
            <WorkspaceSection
              eyebrow="Pulse"
              title="Billing"
              description={`${billing.metrics.paidInvoices} paid invoice${billing.metrics.paidInvoices === 1 ? "" : "s"} · ${money.format(billing.metrics.collected)} collected · ${money.format(billing.metrics.outstanding)} outstanding.`}
            >
              <Link href="/teamoptix/business/finance/billing">Open billing ledger</Link>
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
