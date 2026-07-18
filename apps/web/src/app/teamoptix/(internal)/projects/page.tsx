import TeamOptixDomainOverview from "@/features/teamoptix/shared/TeamOptixDomainOverview";

export default function Page() {
  return <TeamOptixDomainOverview eyebrow="TeamOptix · Projects" title="Delivery portfolio" description="The governed work required to turn business decisions into shipped capability."
    metrics={[
      { label: "Active program", value: "Insight", detail: "Current operating platform" },
      { label: "Current sprint", value: "Governance", detail: "Team Optix operating surfaces" },
      { label: "Decision register", value: "Open", detail: "Architecture and product decisions" },
      { label: "Portfolio system", value: "Next", detail: "Durable project records required" },
    ]}
    panels={[
      { eyebrow: "Current delivery", title: "Insight governance program", actionLabel: "Active work", actionHref: "/teamoptix/projects/active", rows: [
        { title: "Team Optix operating center", detail: "Replace navigation stubs with evidence-backed governance surfaces", status: "Active", href: "/teamoptix/command-center" },
        { title: "Contract authoring", detail: "Complete the reusable customer agreement authoring path", status: "Pending", href: "/teamoptix/business/contracts" },
        { title: "Implementation walkthrough", detail: "Make the customer activation sequence inspectable and repeatable", status: "Pending", href: "/teamoptix/customers" },
      ]},
      { eyebrow: "Governance", title: "Portfolio controls", rows: [
        { title: "Roadmap", detail: "Sequence product outcomes and operating dependencies", status: "Review", href: "/teamoptix/projects/roadmap" },
        { title: "Decisions", detail: "Preserve product, architecture, and implementation decisions", status: "Review", href: "/teamoptix/projects/decisions" },
        { title: "Presentations", detail: "Leadership, implementation, and client communication materials", status: "Open", href: "/teamoptix/projects/presentations" },
      ]},
    ]}
  />;
}
