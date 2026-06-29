"use client";

import TeamOptixShell from "@/features/teamoptix/navigation/TeamOptixShell";
import {
  WorkspaceCard,
  WorkspaceGrid,
  WorkspaceHeader,
  WorkspaceSection,
} from "@/features/ui/workspace";

function SignalRow(props: { label: string; value: string }) {
  return (
    <div className="teamoptix-signal-row">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

export default function TeamOptixCommandCenterPage() {
  return (
    <TeamOptixShell>
      <main className="workspace-shell">
        <section className="workspace-main">
          <WorkspaceHeader
            eyebrow="TeamOptix"
            title="Command Center"
          />

          <WorkspaceGrid>
            <WorkspaceCard eyebrow="Focus" title="Client Priorities">
              <SignalRow label="Time Keeping" value="Planning" />
              <SignalRow label="Scorecards" value="Planning" />
              <SignalRow label="Fleet" value="Discovery" />
            </WorkspaceCard>

            <WorkspaceCard eyebrow="Product" title="Insight">
              <SignalRow label="Current phase" value="Workspace Standard" />
              <SignalRow label="Next build" value="Time Keeping" />
              <SignalRow label="Shell" value="Stabilizing" />
            </WorkspaceCard>

            <WorkspaceCard eyebrow="Projects" title="Active Work">
              <SignalRow label="Insight" value="Active" />
              <SignalRow label="ITG v2.0" value="Planning" />
              <SignalRow label="Presentations" value="Open" />
            </WorkspaceCard>

            <WorkspaceCard eyebrow="Engineering" title="Platform Health">
              <SignalRow label="Lint" value="Passing" />
              <SignalRow label="Typecheck" value="Passing" />
              <SignalRow label="Production" value="Live" />
            </WorkspaceCard>
          </WorkspaceGrid>

          <WorkspaceSection
            eyebrow="Operating Areas"
            title="Foundation"
            description="TeamOptix now owns projects, products, customers, engineering, business, automation, and AI."
          >
            <WorkspaceGrid min={220}>
              <WorkspaceCard eyebrow="Work" title="Projects" body="Active initiatives, roadmap, presentations, and decisions." />
              <WorkspaceCard eyebrow="Work" title="Products" body="Insight, ITG v2.0, and future products." />
              <WorkspaceCard eyebrow="Work" title="Customers" body="Customer accounts, priorities, and launches." />
              <WorkspaceCard eyebrow="Platform" title="Engineering" body="Repositories, releases, and code health." />
              <WorkspaceCard eyebrow="Platform" title="Automation" body="Runner fleet, collections, and telemetry." />
              <WorkspaceCard eyebrow="Business" title="Legal" body="MSA editor and commercial agreements." />
            </WorkspaceGrid>
          </WorkspaceSection>
        </section>
      </main>
    </TeamOptixShell>
  );
}
