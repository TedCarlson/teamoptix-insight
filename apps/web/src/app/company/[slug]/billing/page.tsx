import Link from "next/link";
import { notFound } from "next/navigation";

import { getSupabaseServerClient } from "@/lib/supabase/server";
import CommercialProfileForm from "./CommercialProfileForm";
import BillingWorkflowActions from "./BillingWorkflowActions";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export default async function CompanyBillingPage(props: PageProps) {
  const { slug } = await props.params;
  const supabase = await getSupabaseServerClient();

  const { data: company } = await supabase
    .from("companies")
    .select("id, company_name, company_slug, contact_email, company_size_band")
    .eq("company_slug", slug)
    .single();

  if (!company) notFound();

  const { data: billingCustomer } = await supabase
    .schema("billing")
    .from("customer_subscription_v")
    .select("*")
    .eq("company_id", company.id)
    .maybeSingle();

  const { data: commercialProfile } = await supabase
    .schema("commercial")
    .from("profile")
    .select("*")
    .eq("company_id", company.id)
    .maybeSingle();


  const { data: operatorTiers } = await supabase
    .schema("commercial")
    .from("operator_tier")
    .select("*")
    .eq("active", true)
    .order("sort_order");






  return (
    <main className="workspace-shell">
      <section className="workspace-main">
        <div style={shell}>
          <div style={headerRow}>
            <div>
              <p style={eyebrow}>Company · Billing</p>
              <h1 style={title}>Billing Profile</h1>
            </div>
            <Link href={`/company/${slug}`} style={backLink}>
              Back to Company
            </Link>
          </div>

          <section style={panel}>
            <div style={panelHeader}>
              <div>
                <h2 style={panelTitle}>Commercial Billing Setup</h2>
                <p style={muted}>
                  Stripe customer status, implementation fee, and subscription setup for {company.company_name}.
                </p>
              </div>
              <div
                style={statusPillStyle(
                  commercialProfile?.commercial_status ?? "draft"
                )}
              >
                {formatStatus(commercialProfile?.commercial_status ?? "draft")}
              </div>
            </div>

            <CommercialProfileForm
              billingEmail={company.contact_email ?? ""}
              profile={commercialProfile}
              tiers={operatorTiers ?? []}
            />
          </section>

          <section style={panel}>
            <div style={panelHeader}>
              <div>
                <h2 style={panelTitle}>Billing Workflow</h2>
                <p style={muted}>Actions unlock after operator tier assignment.</p>
              </div>
            </div>

            <BillingWorkflowActions
              slug={slug}
              commercialStatus={commercialProfile?.commercial_status ?? "draft"}
              stripeCustomerId={billingCustomer?.provider_customer_id ?? null}
            />
          </section>
        </div>
      </section>
    </main>
  );
}

function formatStatus(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const shell = {
  display: "grid",
  gap: 14,
};

const headerRow = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 16,
};

const eyebrow = {
  margin: 0,
  color: "#059669",
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: "0.12em",
  textTransform: "uppercase" as const,
};

const title = {
  margin: "2px 0 0",
  color: "#0f172a",
  fontSize: 28,
  letterSpacing: "-0.04em",
};

const panel = {
  border: "1px solid #dbe3ef",
  borderRadius: 14,
  background: "#fff",
  overflow: "hidden",
};

const panelHeader = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 16,
  padding: "16px 18px",
  borderBottom: "1px solid #e2e8f0",
};

const panelTitle = {
  margin: 0,
  color: "#0f172a",
  fontSize: 18,
};

const muted = {
  margin: "4px 0 0",
  color: "#64748b",
};

const table = {
  width: "100%",
  borderCollapse: "collapse" as const,
};

const tr = {
  borderBottom: "1px solid #e2e8f0",
};

const th = {
  width: 260,
  padding: "12px 18px",
  textAlign: "left" as const,
  color: "#64748b",
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: "0.08em",
  textTransform: "uppercase" as const,
  background: "#f8fafc",
};

const td = {
  padding: "12px 18px",
  color: "#0f172a",
  fontWeight: 800,
};

function statusPillStyle(status: string) {
  const base = {
    borderRadius: 999,
    padding: "6px 10px",
    fontSize: 12,
    fontWeight: 900,
  };

  if (
    status === "implementation_paid" ||
    status === "subscription_active"
  ) {
    return {
      ...base,
      border: "1px solid #10b981",
      color: "#047857",
      background: "#ecfdf5",
    };
  }

  if (
    status === "ready_for_stripe" ||
    status === "stripe_customer_created"
  ) {
    return {
      ...base,
      border: "1px solid #f59e0b",
      color: "#92400e",
      background: "#fffbeb",
    };
  }

  if (status === "suspended" || status === "cancelled") {
    return {
      ...base,
      border: "1px solid #ef4444",
      color: "#b91c1c",
      background: "#fef2f2",
    };
  }

  return {
    ...base,
    border: "1px solid #cbd5e1",
    color: "#475569",
    background: "#f8fafc",
  };
}

const backLink = {
  color: "#0f172a",
  fontWeight: 900,
  textDecoration: "none",
};
