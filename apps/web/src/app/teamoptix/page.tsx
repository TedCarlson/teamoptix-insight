"use client";

import TeamOptixShell from "@/features/teamoptix/navigation/TeamOptixShell";
import {
  WorkspaceHeader,
  WorkspaceSection,
} from "@/features/ui/workspace";
import { SignalList } from "@/features/ui/signals";

export default function TeamOptixCommandCenterPage() {
  return (
    <TeamOptixShell>
      <main className="workspace-shell">
        <section className="workspace-main">
          <WorkspaceHeader eyebrow="TeamOptix" title="Command Center" />

          <section className="teamoptix-console">
            <WorkspaceSection eyebrow="Today" title="Client Priorities">
              <SignalList
                items={[
                  { label: "Time Keeping", value: "Planning", detail: "Client mention" },
                  { label: "Scorecards", value: "Planning", detail: "Client mention" },
                  { label: "Fleet Workspace", value: "Discovery", detail: "Expansion" },
                ]}
              />
            </WorkspaceSection>

            <WorkspaceSection eyebrow="Platform Work" title="Current Build">
              <SignalList
                items={[
                  { label: "Workspace Standard", value: "Active", detail: "Foundation pass" },
                  { label: "TeamOptix Shell", value: "Scaffolded", detail: "Navigation + routes" },
                  { label: "Mobile Shell", value: "Stable", detail: "Drawer-first" },
                ]}
              />
            </WorkspaceSection>

            <WorkspaceSection eyebrow="Products" title="Portfolio">
              <SignalList
                items={[
                  { label: "Insight", value: "Active", detail: "Customer operating platform" },
                  { label: "ITG v2.0", value: "Planning", detail: "Separate repo / TeamOptix-managed" },
                  { label: "Legal Workspace", value: "Live", detail: "MSA editor available" },
                ]}
              />
            </WorkspaceSection>

            <WorkspaceSection eyebrow="Engineering" title="Health">
              <SignalList
                items={[
                  { label: "Lint", value: "Passing" },
                  { label: "Typecheck", value: "Passing" },
                  { label: "Main", value: "Clean" },
                ]}
              />
            </WorkspaceSection>

            <WorkspaceSection eyebrow="Recent Decisions" title="Locked In">
              <SignalList
                items={[
                  { label: "TeamOptix", value: "Umbrella layer", detail: "Above Insight" },
                  { label: "Navigation", value: "Drawer-first", detail: "Platform congruent" },
                  { label: "Legal", value: "Business workspace", detail: "MSA preserved" },
                ]}
              />
            </WorkspaceSection>
          </section>
        </section>
      </main>
    </TeamOptixShell>
  );
}
