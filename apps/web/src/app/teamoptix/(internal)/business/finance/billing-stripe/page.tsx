import TeamOptixShell from "@/features/teamoptix/navigation/TeamOptixShell";
import { WorkspaceHeader, WorkspaceSection } from "@/features/ui/workspace";
import { getStripeServerClient } from "@/lib/stripe/server";

type BillingMetric = {
  label: string;
  value: string;
};

type BillingCatalogItem = {
  productId: string;
  productName: string;
  priceId: string;
  amount: string;
  cadence: string;
  status: string;
};

type StripeMode = "Live" | "Sandbox" | "Unknown";

async function loadStripeBillingStatus() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  const mode: StripeMode = secretKey?.startsWith("sk_live_")
    ? "Live"
    : secretKey?.startsWith("sk_test_")
      ? "Sandbox"
      : "Unknown";

  if (!secretKey || !publishableKey) {
    return {
      connected: false,
      mode,
      error: "Stripe API keys are not configured.",
      metrics: [] as BillingMetric[],
      catalog: [] as BillingCatalogItem[],
      webhookConfigured: Boolean(webhookSecret),
    };
  }

  try {
    const stripe = getStripeServerClient();

    const [customers, products, prices, subscriptions, invoices] = await Promise.all([
      stripe.customers.list({ limit: 100 }),
      stripe.products.list({ limit: 100 }),
      stripe.prices.list({ limit: 100 }),
      stripe.subscriptions.list({ limit: 100, status: "all" }),
      stripe.invoices.list({ limit: 100 }),
    ]);

    const productById = new Map(products.data.map((product) => [product.id, product]));

    const catalog: BillingCatalogItem[] = prices.data
      .map((price) => {
        const productId = typeof price.product === "string" ? price.product : price.product.id;
        const product = productById.get(productId);
        const unitAmount = price.unit_amount ?? 0;
        const amount = `$${(unitAmount / 100).toFixed(2)}`;

        return {
          productId,
          productName: product?.name ?? productId,
          priceId: price.id,
          amount,
          cadence: price.recurring?.interval ? `Per ${price.recurring.interval}` : "One-time",
          status: price.active && product?.active !== false ? "Active" : "Inactive",
        };
      })
      .sort((a, b) => catalogSortKey(a).localeCompare(catalogSortKey(b)));

    return {
      connected: true,
      mode,
      error: null,
      webhookConfigured: Boolean(webhookSecret),
      metrics: [
        { label: "Customers", value: String(customers.data.length) },
        { label: "Products", value: String(products.data.length) },
        { label: "Prices", value: String(prices.data.length) },
        { label: "Subscriptions", value: String(subscriptions.data.length) },
        { label: "Invoices", value: String(invoices.data.length) },
      ],
      catalog,
    };
  } catch (error) {
    return {
      connected: false,
      mode,
      error: error instanceof Error ? error.message : "Stripe connection failed.",
      webhookConfigured: Boolean(webhookSecret),
      metrics: [] as BillingMetric[],
      catalog: [] as BillingCatalogItem[],
    };
  }
}


function catalogSortKey(item: BillingCatalogItem) {
  const name = item.productName.toLowerCase();

  let tier = 99;
  if (name.includes("up to 10") || name.includes("1-10")) tier = 10;
  else if (name.includes("11 to 15") || name.includes("11-15")) tier = 20;
  else if (name.includes("16 to 25") || name.includes("16-25")) tier = 30;
  else if (name.includes("26 to 50") || name.includes("26-50")) tier = 40;

  const kind = item.cadence.toLowerCase().includes("week") ? 0 : 1;

  return `${String(tier).padStart(2, "0")}-${kind}-${name}`;
}

export default async function Page() {
  const status = await loadStripeBillingStatus();

  return (
    <TeamOptixShell>
      <main className="workspace-shell">
        <section className="workspace-main">
          <WorkspaceHeader
            eyebrow="TeamOptix · Business · Finance"
            title="Billing Stripe"
            description="Stripe provider administration for connectivity, catalog, customers, subscriptions, invoices, payments, and webhooks."
          />

          <WorkspaceSection
            eyebrow="Provider"
            title="Stripe"
            description={
              status.connected
                ? `Stripe ${status.mode.toLowerCase()} mode is connected.`
                : "Stripe is not connected."
            }
          >
            <div
              style={{
                display: "grid",
                gap: 12,
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              }}
            >
              <BillingStatusCard label="API" value={status.connected ? "Connected" : "Not connected"} />
              <BillingStatusCard label="Mode" value={status.mode} />
              <BillingStatusCard
                label="Webhook Secret"
                value={status.webhookConfigured ? "Configured" : "Missing"}
              />
            </div>

            {status.error ? (
              <p style={{ marginTop: 16, color: "#b91c1c", fontWeight: 700 }}>{status.error}</p>
            ) : null}
          </WorkspaceSection>

          <WorkspaceSection
            eyebrow="Stripe Objects"
            title={`${status.mode} Counts`}
            description={`Current Stripe ${status.mode.toLowerCase()} object counts available to Insight.`}
          >
            <div
              style={{
                display: "grid",
                gap: 12,
                gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              }}
            >
              {status.metrics.map((metric) => (
                <BillingStatusCard key={metric.label} label={metric.label} value={metric.value} />
              ))}
            </div>
          </WorkspaceSection>

          <WorkspaceSection
            eyebrow="Catalog"
            title="Stripe Commercial Catalog"
            description={`Active Stripe ${status.mode.toLowerCase()} products and prices available for Insight billing workflows.`}
          >
            <div style={{ display: "grid", gap: 10 }}>
              {status.catalog.map((item) => (
                <div
                  key={item.priceId}
                  className="stripe-catalog-row"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(260px, 1fr) 120px 120px 100px",
                    gap: 12,
                    alignItems: "center",
                    border: "1px solid #dbe3ef",
                    borderRadius: 16,
                    padding: 14,
                    background: "#fff",
                  }}
                >
                  <div>
                    <p style={{ margin: 0, color: "#0f172a", fontWeight: 900 }}>{item.productName}</p>
                    <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 12 }}>{item.priceId}</p>
                  </div>
                  <strong>{item.amount}</strong>
                  <span>{item.cadence}</span>
                  <strong style={{ color: item.status === "Active" ? "#059669" : "#b91c1c" }}>
                    {item.status}
                  </strong>
                </div>
              ))}
            </div>
          </WorkspaceSection>
        </section>
      </main>
    </TeamOptixShell>
  );
}

function BillingStatusCard(props: { label: string; value: string }) {
  return (
    <div
      className="stripe-status-card"
      style={{
        border: "1px solid #dbe3ef",
        borderRadius: 18,
        padding: 18,
        background: "#fff",
      }}
    >
      <p
        style={{
          margin: 0,
          color: "#059669",
          fontSize: 12,
          fontWeight: 900,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}
      >
        {props.label}
      </p>
      <p style={{ margin: "8px 0 0", color: "#0f172a", fontSize: 24, fontWeight: 900 }}>
        {props.value}
      </p>
    </div>
  );
}
