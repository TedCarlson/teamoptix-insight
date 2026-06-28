import SiteHeader from "@/features/landing/components/SiteHeader";

function BillingBlock(props: {
  eyebrow: string;
  title: string;
  description: string;
  items: string[];
}) {
  return (
    <section
      style={{
        border: "1px solid var(--line)",
        borderRadius: 18,
        background: "rgba(255,255,255,0.74)",
        padding: 18,
        display: "grid",
        gap: 14,
        minWidth: 0,
      }}
    >
      <div style={{ display: "grid", gap: 4 }}>
        <p className="eyebrow">{props.eyebrow}</p>
        <h2 style={{ margin: 0, color: "var(--ink)", fontSize: 21, lineHeight: 1.1 }}>
          {props.title}
        </h2>
        <p style={{ margin: 0, color: "var(--muted)", fontWeight: 650, lineHeight: 1.45 }}>
          {props.description}
        </p>
      </div>

      <div
        style={{
          display: "grid",
          border: "1px solid var(--line)",
          borderRadius: 14,
          overflow: "hidden",
          background: "rgba(255,255,255,0.55)",
        }}
      >
        {props.items.map((item) => (
          <div
            key={item}
            style={{
              padding: "10px 12px",
              borderTop: "1px solid var(--line)",
              color: "var(--ink)",
              fontSize: 14,
              fontWeight: 750,
            }}
          >
            {item}
          </div>
        ))}
      </div>
    </section>
  );
}

export default function CommercialPage() {
  return (
    <main className="workspace-shell">
      <SiteHeader />

      <section className="workspace-main" style={{ gap: 18 }}>
        <header style={{ display: "grid", gap: 6 }}>
          <p className="eyebrow">Insight Commercial</p>
          <h1
            className="workspace-title"
            style={{ fontSize: "clamp(2rem, 3.4vw, 3.25rem)", margin: 0 }}
          >
            Billing Management Center
          </h1>
          <p className="workspace-subtitle">
            Insight owns the customer relationship and billing rules. Payment services execute collection later.
          </p>
        </header>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 16,
            alignItems: "start",
          }}
        >
          <BillingBlock
            eyebrow="Commercial Relationship"
            title="Commercial Agreements"
            description="The agreement between Insight and each customer company."
            items={[
              "Company",
              "Agreement status",
              "Billing contact",
              "Renewal date",
            ]}
          />

          <BillingBlock
            eyebrow="Plans"
            title="Subscription Plans"
            description="The commercial packages, tiers, and entitlements Insight offers."
            items={[
              "Plan name",
              "Billing cadence",
              "Included modules",
              "Base price",
            ]}
          />

          <BillingBlock
            eyebrow="Lifecycle"
            title="Trial Management"
            description="The trial posture before a company becomes a paying customer."
            items={[
              "Trial start",
              "Trial end",
              "Conversion status",
              "Owner follow-up",
            ]}
          />

          <BillingBlock
            eyebrow="Billing Operations"
            title="Billing Status"
            description="The current billable state of each customer relationship."
            items={[
              "Active",
              "Grace period",
              "Suspended",
              "Canceled",
            ]}
          />

          <BillingBlock
            eyebrow="Records"
            title="Invoice History"
            description="The official billing record created by Insight before payment processing."
            items={[
              "Invoice period",
              "Invoice amount",
              "Invoice status",
              "Payment provider reference",
            ]}
          />

          <BillingBlock
            eyebrow="Controls"
            title="Billing Policies"
            description="The rules that govern trials, renewals, grace periods, and suspension."
            items={[
              "Trial policy",
              "Renewal policy",
              "Grace period policy",
              "Suspension policy",
            ]}
          />
        </section>
      </section>
    </main>
  );
}
