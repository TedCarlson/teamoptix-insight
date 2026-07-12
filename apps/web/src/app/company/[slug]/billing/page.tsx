import Link from "next/link";
import { notFound } from "next/navigation";

import { getSupabaseServerClient } from "@/lib/supabase/server";
import CommercialTierEvidencePanel from "@/features/commercial/components/CommercialTierEvidencePanel";
import { getCommercialTierEvidence } from "@/features/commercial/server/commercialTierEvidence.server";
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

  const tierEvidence = await getCommercialTierEvidence({
    supabase,
    companyId: company.id,
    declaredTierKey: commercialProfile?.operator_tier_key,
    operatorTiers: operatorTiers ?? [],
  });

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

          <div className="company-billing-commercial-grid">
            <section style={panel}>
              <div style={panelHeader}>
                <div>
                  <h2 style={panelTitle}>Commercial Billing Setup</h2>
                  <p style={muted}>
                    Stripe customer status, implementation fee, and subscription setup for {company.company_name}.
                  </p>
                </div>
              </div>

              <CommercialProfileForm
                billingEmail={company.contact_email ?? ""}
                profile={commercialProfile}
                tiers={operatorTiers ?? []}
              />
            </section>

            <CommercialTierEvidencePanel evidence={tierEvidence} />
          </div>

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


const backLink = {
  color: "#0f172a",
  fontWeight: 900,
  textDecoration: "none",
};
