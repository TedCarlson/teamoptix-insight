import TeamOptixDomainOverview from "@/features/teamoptix/shared/TeamOptixDomainOverview";
import { getGovernedCompanies } from "@/features/teamoptix/command-center/commandCenter.server";

export const dynamic = "force-dynamic";

export default async function Page() {
  const customers = await getGovernedCompanies();
  return <TeamOptixDomainOverview eyebrow="TeamOptix · Products" title="Product portfolio" description="Govern Team Optix-owned products, their customer footprint, and the systems required to operate them."
    metrics={[
      { label: "Insight products", value: 3, detail: "In service, in review, and planned" },
      { label: "Insight customers", value: customers.length, detail: "Authoritative governed scope" },
      { label: "Operational domains", value: 8, detail: "Insight workspace capabilities" },
      { label: "Review studios", value: 1, detail: "Telecom Fulfillment is locally isolated" },
    ]}
    panels={[
      { eyebrow: "Insight product family", title: "Three products with separate operating boundaries", actionLabel: "Open in-service product", actionHref: "/teamoptix/products/insight", rows: [
        { title: "Insight — P&D Last Mile", detail: "Operations, people, schedule, fleet, routes, payroll, and intelligence", status: "In service", href: "/teamoptix/products/insight" },
        { title: "Insight — Telecom Fulfillment", detail: "Metrics-led telecom workforce, People, onboarding, and reporting review studio", status: "In review", href: "/teamoptix/products/itg" },
        { title: "Utility Locate Service", detail: "Planned standalone product with its own application governance, data boundary, and future design review", status: "Planned", href: "/teamoptix/products/uls" },
        { title: "Customer footprint", detail: `${customers.length} governed Insight ${customers.length === 1 ? "customer" : "customers"}`, status: "Live", href: "/teamoptix/customers" },
        { title: "Commercial governance", detail: "Contracts, activation readiness, billing, and customer control", status: "Connected", href: "/teamoptix/business/contracts" },
      ]},
      { eyebrow: "Shared capability boundary", title: "Team Optix platform services", rows: [
        { title: "Platform services", detail: "Identity, profile, company entry, theme, commercial governance, and billing may be shared without sharing product operations", status: "Governed", href: "/teamoptix/platform" },
        { title: "Legal workspace", detail: "Shared Team Optix document authoring and evidence capability", status: "Live", href: "/teamoptix/business/contracts" },
      ]},
    ]}
  />;
}
