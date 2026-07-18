import TeamOptixDomainOverview from "@/features/teamoptix/shared/TeamOptixDomainOverview";
import { getGovernedCompanies } from "@/features/teamoptix/command-center/commandCenter.server";

export const dynamic = "force-dynamic";

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default async function TeamOptixCustomersPage() {
  const companies = await getGovernedCompanies();
  const active = companies.filter((company) => company.lifecycle_status === "active").length;
  const implementing = companies.filter((company) => company.lifecycle_status === "implementation").length;
  const blockers = companies.reduce((sum, company) => sum + company.blocker_count, 0);

  return <TeamOptixDomainOverview eyebrow="TeamOptix · Customers" title="Customer governance" description="Commercial posture, implementation readiness, and direct operating access for governed Insight customers."
    metrics={[
      { label: "Governed customers", value: companies.length, detail: "Authoritative Insight scope" },
      { label: "Active", value: active, detail: "Live customer operations" },
      { label: "Implementing", value: implementing, detail: "Pre-Go Live lifecycle" },
      { label: "Readiness blockers", value: blockers, detail: blockers ? "Requires attention" : "Portfolio clear" },
    ]}
    panels={[
      { eyebrow: "Customer portfolio", title: "Insight customers", actionLabel: "Switch company", actionHref: "/teamoptix/command-center", rows: companies.map((company) => ({
        title: company.company_name ?? company.company_slug,
        detail: company.readiness_total ? `${company.readiness_complete} of ${company.readiness_total} readiness domains complete` : "Automation governed; activation readiness not initialized",
        status: company.blocker_count ? `${company.blocker_count} blockers` : label(company.lifecycle_status),
        href: `/teamoptix/customers/${company.company_slug}`,
      })) },
      { eyebrow: "Implementation control", title: "Customer lifecycle", rows: [
        { title: "Commercial and payment", detail: "Confirm tier, implementation fee, subscription, and payment evidence", status: "Gate 1", href: companies[0] ? `/teamoptix/customers/${companies[0].company_slug}` : "/teamoptix/customers" },
        { title: "Agreement and workspace", detail: "Lock the governing agreement and establish authorized workspace access", status: "Gate 2", href: "/teamoptix/business/contracts/tasks" },
        { title: "Credentials and automation", detail: "Validate provider authority, ticket assignments, and collection execution", status: "Gate 3", href: "/teamoptix/automation/assignments" },
        { title: "Training, approval, and Go Live", detail: "Complete human readiness before activation is requested", status: "Gate 4", href: companies[0] ? `/teamoptix/customers/${companies[0].company_slug}` : "/teamoptix/customers" },
      ]},
    ]}
  />;
}
