import TeamOptixDomainOverview from "@/features/teamoptix/shared/TeamOptixDomainOverview";
import { getGovernedCompanies } from "@/features/teamoptix/command-center/commandCenter.server";

export const dynamic = "force-dynamic";

export default async function Page() {
  const customers = await getGovernedCompanies();
  return <TeamOptixDomainOverview eyebrow="TeamOptix · Products" title="Product portfolio" description="Govern Team Optix-owned products, their customer footprint, and the systems required to operate them."
    metrics={[
      { label: "Active products", value: 1, detail: "Insight in governed operation" },
      { label: "Insight customers", value: customers.length, detail: "Authoritative governed scope" },
      { label: "Operational domains", value: 8, detail: "Insight workspace capabilities" },
      { label: "Separate initiatives", value: 1, detail: "ITG remains independently scoped" },
    ]}
    panels={[
      { eyebrow: "Operating product", title: "Insight", actionLabel: "Product record", actionHref: "/teamoptix/products/insight", rows: [
        { title: "Customer operating platform", detail: "Operations, people, schedule, fleet, routes, payroll, and intelligence", status: "Active", href: "/teamoptix/products/insight" },
        { title: "Customer footprint", detail: `${customers.length} governed Insight ${customers.length === 1 ? "customer" : "customers"}`, status: "Live", href: "/teamoptix/customers" },
        { title: "Commercial governance", detail: "Contracts, activation readiness, billing, and customer control", status: "Connected", href: "/teamoptix/business/contracts" },
      ]},
      { eyebrow: "Portfolio boundary", title: "Other Team Optix work", rows: [
        { title: "ITG v2.0", detail: "Sister initiative maintained outside the Insight customer and implementation scope", status: "Separate", href: "/teamoptix/products/itg" },
        { title: "Legal workspace", detail: "Shared Team Optix document authoring and evidence capability", status: "Live", href: "/teamoptix/business/contracts" },
      ]},
    ]}
  />;
}
