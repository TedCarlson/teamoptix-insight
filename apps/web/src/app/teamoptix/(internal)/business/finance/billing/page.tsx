import Link from "next/link";

import TeamOptixShell from "@/features/teamoptix/navigation/TeamOptixShell";
import { getFinanceBillingSnapshot } from "@/features/teamoptix/finance/financeBilling.server";
import { WorkspaceHeader, WorkspaceSection } from "@/features/ui/workspace";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const dateTime = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

function showDate(value: string | null) {
  return value ? dateTime.format(new Date(value)) : "—";
}

function statusColor(status: string) {
  if (["paid", "active", "processed", "ready"].includes(status)) return "#047857";
  if (["failed", "past_due", "unpaid", "uncollectible"].includes(status)) return "#b91c1c";
  return "#475569";
}

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse" as const,
  fontSize: 13,
};

const cellStyle = {
  borderBottom: "1px solid #e2e8f0",
  padding: "12px 10px",
  textAlign: "left" as const,
  verticalAlign: "top" as const,
};

export default async function Page() {
  const snapshot = await getFinanceBillingSnapshot();

  return (
    <TeamOptixShell>
      <main className="workspace-shell">
        <section className="workspace-main">
          <WorkspaceHeader
            eyebrow="TeamOptix · Business · Finance"
            title="Billing"
            description="Team Optix-owned invoice, receivable, payment, customer, subscription, and provider-event records synchronized from Stripe."
          />

          <WorkspaceSection
            eyebrow="Ledger"
            title="Billing posture"
            description="Current totals calculated from Insight records, not live Stripe list counts."
          >
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
              <Metric label="Live customers" value={String(snapshot.metrics.liveCustomers)} />
              <Metric label="Paid invoices" value={String(snapshot.metrics.paidInvoices)} />
              <Metric label="Open invoices" value={String(snapshot.metrics.openInvoices)} />
              <Metric label="Collected" value={money.format(snapshot.metrics.collected)} />
              <Metric label="Outstanding" value={money.format(snapshot.metrics.outstanding)} />
              <Metric label="Active subscriptions" value={String(snapshot.metrics.activeSubscriptions)} />
              <Metric
                label="Failed sync events"
                value={String(snapshot.metrics.failedEvents)}
                danger={snapshot.metrics.failedEvents > 0}
              />
            </div>
          </WorkspaceSection>

          <WorkspaceSection
            eyebrow="Invoices"
            title="Invoice ledger"
            description="Invoice status, receivable balance, customer document, and provider evidence."
          >
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead><tr>{["Invoice", "Customer", "Issued", "Due", "Paid", "Balance", "Status", "Documents"].map((label) => <th key={label} style={cellStyle}>{label}</th>)}</tr></thead>
                <tbody>
                  {snapshot.invoices.map((invoice) => (
                    <tr key={invoice.id}>
                      <td style={cellStyle}><strong>{invoice.invoice_number ?? invoice.provider_invoice_id}</strong><br /><small>{invoice.provider_invoice_id}</small></td>
                      <td style={cellStyle}>{invoice.company_name}</td>
                      <td style={cellStyle}>{showDate(invoice.issued_at)}</td>
                      <td style={cellStyle}>{money.format(invoice.amount_due)}</td>
                      <td style={cellStyle}>{money.format(invoice.amount_paid)}</td>
                      <td style={cellStyle}>{money.format(invoice.amount_remaining)}</td>
                      <td style={{ ...cellStyle, color: statusColor(invoice.invoice_status), fontWeight: 900 }}>{invoice.invoice_status}</td>
                      <td style={cellStyle}>
                        {invoice.hosted_invoice_url ? <a href={invoice.hosted_invoice_url} target="_blank" rel="noreferrer">View</a> : "—"}
                        {invoice.invoice_pdf_url ? <> · <a href={invoice.invoice_pdf_url} target="_blank" rel="noreferrer">PDF</a></> : null}
                      </td>
                    </tr>
                  ))}
                  {snapshot.invoices.length === 0 ? <tr><td style={cellStyle} colSpan={8}>No invoices have been recorded.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </WorkspaceSection>

          <WorkspaceSection
            eyebrow="Payments"
            title="Payment ledger"
            description="Collected, failed, and refunded payment evidence linked to invoices and Stripe objects."
          >
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead><tr>{["Customer", "Purpose", "Paid", "Amount", "Refunded", "Status", "Invoice", "Evidence"].map((label) => <th key={label} style={cellStyle}>{label}</th>)}</tr></thead>
                <tbody>
                  {snapshot.payments.map((payment) => (
                    <tr key={payment.id}>
                      <td style={cellStyle}>{payment.company_name}</td>
                      <td style={cellStyle}>{payment.payment_purpose}</td>
                      <td style={cellStyle}>{showDate(payment.paid_at)}</td>
                      <td style={cellStyle}>{money.format(payment.amount)}</td>
                      <td style={cellStyle}>{money.format(payment.amount_refunded)}</td>
                      <td style={{ ...cellStyle, color: statusColor(payment.payment_status), fontWeight: 900 }}>{payment.payment_status}</td>
                      <td style={cellStyle}>{payment.provider_invoice_id ?? "—"}</td>
                      <td style={cellStyle}>{payment.receipt_url ? <a href={payment.receipt_url} target="_blank" rel="noreferrer">Receipt</a> : payment.provider_payment_intent_id ?? "—"}</td>
                    </tr>
                  ))}
                  {snapshot.payments.length === 0 ? <tr><td style={cellStyle} colSpan={8}>No payments have been recorded.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </WorkspaceSection>

          <WorkspaceSection eyebrow="Customers" title="Customer billing" description="Insight customer identity and Stripe environment alignment.">
            <div className="signal-list">
              {snapshot.customers.map((customer) => (
                <Link key={customer.id} className="signal-list__row" href={`/company/${customer.company_slug}/billing`} style={{ color: "inherit", textDecoration: "none" }}>
                  <div><strong>{customer.company_name}</strong><span>{customer.billing_name ?? "No billing contact"} · {customer.billing_email ?? "No billing email"}<br />{customer.provider_customer_id ?? "Stripe customer not connected"}</span></div>
                  <em style={{ color: statusColor(customer.billing_status) }}>{customer.provider_livemode === true ? "Live" : customer.provider_livemode === false ? "Sandbox" : "Unassigned"} · {customer.billing_status}</em>
                </Link>
              ))}
            </div>
          </WorkspaceSection>

          <WorkspaceSection eyebrow="Subscriptions" title="Recurring billing" description="Provider subscriptions and billing periods synchronized into Insight.">
            <div className="signal-list">
              {snapshot.subscriptions.map((subscription) => (
                <div key={subscription.id} className="signal-list__row">
                  <div><strong>{subscription.company_name}</strong><span>{subscription.provider_subscription_id ?? "Provider subscription pending"} · {subscription.provider_price_id ?? "Price not recorded"}</span></div>
                  <em style={{ color: statusColor(subscription.subscription_status) }}>{subscription.subscription_status}</em>
                </div>
              ))}
              {snapshot.subscriptions.length === 0 ? <p style={{ margin: 0, color: "#64748b" }}>No recurring subscription has been created yet.</p> : null}
            </div>
          </WorkspaceSection>

          <WorkspaceSection eyebrow="Audit" title="Stripe event ledger" description="Signed webhook receipts, processing outcomes, and retry evidence retained by Insight.">
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead><tr>{["Occurred", "Event", "Customer", "Object", "Status", "Attempts"].map((label) => <th key={label} style={cellStyle}>{label}</th>)}</tr></thead>
                <tbody>
                  {snapshot.events.map((event) => (
                    <tr key={event.id}>
                      <td style={cellStyle}>{showDate(event.occurred_at)}</td>
                      <td style={cellStyle}><strong>{event.event_type}</strong><br /><small>{event.provider_event_id}</small></td>
                      <td style={cellStyle}>{event.company_name ?? "Unmapped"}</td>
                      <td style={cellStyle}>{event.object_id ?? "—"}</td>
                      <td style={{ ...cellStyle, color: statusColor(event.processing_status), fontWeight: 900 }}>{event.processing_status}{event.last_error ? <><br /><small>{event.last_error}</small></> : null}</td>
                      <td style={cellStyle}>{event.processing_attempts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </WorkspaceSection>

          <WorkspaceSection eyebrow="Boundary" title="Accounting integration" description="Accounting software export and ledger posting will consume these owned billing records in the next phase.">
            <p style={{ margin: 0, color: "#64748b", fontWeight: 700 }}>Stripe remains the payment provider. Insight now owns the operational finance ledger that accounting will reconcile against.</p>
          </WorkspaceSection>
        </section>
      </main>
    </TeamOptixShell>
  );
}

function Metric(props: { label: string; value: string; danger?: boolean }) {
  return <div style={{ border: "1px solid #dbe3ef", borderRadius: 18, padding: 18, background: "#fff" }}><p style={{ margin: 0, color: props.danger ? "#b91c1c" : "#059669", fontSize: 12, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase" }}>{props.label}</p><p style={{ margin: "8px 0 0", color: "#0f172a", fontSize: 24, fontWeight: 900 }}>{props.value}</p></div>;
}
