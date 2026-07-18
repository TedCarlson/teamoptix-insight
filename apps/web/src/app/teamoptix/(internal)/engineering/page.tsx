import TeamOptixDomainOverview from "@/features/teamoptix/shared/TeamOptixDomainOverview";

export default function Page() {
  return <TeamOptixDomainOverview eyebrow="TeamOptix · Engineering" title="Engineering control" description="Release confidence, repository posture, and the technical work protecting Insight operations."
    metrics={[
      { label: "Primary repository", value: "Insight", detail: "teamoptix-insight" },
      { label: "Production branch", value: "main", detail: "Vercel deployment source" },
      { label: "Quality gates", value: 3, detail: "Lint, typecheck, production build" },
      { label: "Live telemetry", value: "Not wired", detail: "Repository provider connection required" },
    ]}
    panels={[
      { eyebrow: "Delivery confidence", title: "Engineering gates", actionLabel: "Code health", actionHref: "/teamoptix/engineering/health", rows: [
        { title: "Type safety", detail: "Application-wide TypeScript verification before release", status: "Required", href: "/teamoptix/engineering/health" },
        { title: "Code quality", detail: "Lint and framework rules across the web application", status: "Required", href: "/teamoptix/engineering/health" },
        { title: "Production build", detail: "Next.js compilation and route generation", status: "Required", href: "/teamoptix/engineering/releases" },
      ]},
      { eyebrow: "Source and release", title: "Engineering workspaces", rows: [
        { title: "Repositories", detail: "Connect authoritative repository and branch metadata", status: "Needs provider", href: "/teamoptix/engineering/repositories" },
        { title: "Releases", detail: "Record deployed commits, environments, and release outcomes", status: "Needs ledger", href: "/teamoptix/engineering/releases" },
        { title: "Technical health", detail: "Track failures, debt, and corrective work from evidence", status: "Open", href: "/teamoptix/engineering/health" },
      ]},
    ]}
  />;
}
