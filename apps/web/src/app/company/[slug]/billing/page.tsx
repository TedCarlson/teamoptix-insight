import Link from "next/link";
import { notFound } from "next/navigation";

import { getSupabaseServerClient } from "@/lib/supabase/server";
import CommercialProfileForm from "./CommercialProfileForm";

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
              <div style={statusPill}>Not Ready</div>
            </div>

            <CommercialProfileForm
              billingEmail={company.contact_email ?? ""}
              profile={commercialProfile}
            />
          </section>

          <section style={panel}>
            <div style={panelHeader}>
              <div>
                <h2 style={panelTitle}>Billing Workflow</h2>
                <p style={muted}>Actions unlock after operator tier assignment.</p>
              </div>
            </div>

            <div style={actionRow}>
              <button type="button" disabled style={disabledButton}>
                Create Stripe Customer
              </button>
              <button type="button" disabled style={disabledButton}>
                Launch Stripe Checkout
              </button>
            </div>
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

const statusPill = {
  border: "1px solid #f59e0b",
  borderRadius: 999,
  padding: "6px 10px",
  color: "#92400e",
  background: "#fffbeb",
  fontSize: 12,
  fontWeight: 900,
};

const actionRow = {
  display: "flex",
  gap: 10,
  padding: 18,
};

const disabledButton = {
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  padding: "9px 12px",
  background: "#e2e8f0",
  color: "#64748b",
  fontWeight: 900,
  cursor: "not-allowed",
};

const backLink = {
  color: "#0f172a",
  fontWeight: 900,
  textDecoration: "none",
};
