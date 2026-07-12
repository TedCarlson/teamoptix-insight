import TeamOptixShell from "@/features/teamoptix/navigation/TeamOptixShell";
import { WorkspaceHeader, WorkspaceSection } from "@/features/ui/workspace";

export default function Page() {
  return (
    <TeamOptixShell>
      <main className="workspace-shell">
        <section className="workspace-main">
          <WorkspaceHeader
            eyebrow="TeamOptix · Business · Finance"
            title="Billing"
            description="Team Optix billing workspace for customer billing, invoices, receivables, revenue capture, payments, and billing operations."
          />

          <WorkspaceSection
            eyebrow="Workspace"
            title="Customer Billing"
            description="This workspace will govern Team Optix customer billing operations. Stripe remains the payment provider, but billing ownership lives here."
          >
            <div
              style={{
                display: "grid",
                gap: 12,
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              }}
            >
              <BillingWorkspaceCard
                title="Customer Billing"
                description="Customer billing state, subscription posture, billing contacts, and commercial readiness."
              />
              <BillingWorkspaceCard
                title="Invoices"
                description="Weekly invoices, invoice history, invoice status, and customer-facing billing documents."
              />
              <BillingWorkspaceCard
                title="Receivables"
                description="Open balances, aging, payment status, collection posture, and follow-up workflows."
              />
              <BillingWorkspaceCard
                title="Payments"
                description="Payment records, receipts, failed payments, credits, refunds, and reconciliation."
              />
              <BillingWorkspaceCard
                title="Revenue"
                description="MRR, ARR, customer revenue, pricing posture, implementation revenue, and revenue capture."
              />
            </div>
          </WorkspaceSection>

          <WorkspaceSection
            eyebrow="Boundary"
            title="Stripe Provider"
            description="Stripe administration is managed separately from Team Optix billing operations."
          >
            <p style={{ margin: 0, color: "#64748b", fontWeight: 700 }}>
              Use the Stripe workspace for provider configuration, products, prices, customers,
              subscriptions, webhooks, and connectivity health.
            </p>
          </WorkspaceSection>
        </section>
      </main>
    </TeamOptixShell>
  );
}

function BillingWorkspaceCard(props: { title: string; description: string }) {
  return (
    <div
      style={{
        border: "1px solid #dbe3ef",
        borderRadius: 18,
        padding: 18,
        background: "#fff",
      }}
    >
      <p style={{ margin: 0, color: "#0f172a", fontSize: 16, fontWeight: 900 }}>
        {props.title}
      </p>
      <p style={{ margin: "8px 0 0", color: "#64748b", fontSize: 13, fontWeight: 700, lineHeight: 1.5 }}>
        {props.description}
      </p>
    </div>
  );
}
