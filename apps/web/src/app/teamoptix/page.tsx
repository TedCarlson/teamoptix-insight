"use client";

import TeamOptixShell from "@/features/teamoptix/navigation/TeamOptixShell";
import {
  WorkspaceHeader,
  WorkspaceSection,
} from "@/features/ui/workspace";
import { SignalList } from "@/features/ui/signals";
import { commandCenterSections, engineeringSections, productSections } from "@/features/teamoptix/registry";

export default function TeamOptixCommandCenterPage() {
  return (
    <TeamOptixShell>
      <main className="workspace-shell">
        <section className="workspace-main">
          <WorkspaceHeader eyebrow="TeamOptix" title="Command Center" />

          <section className="teamoptix-console">
            {[...commandCenterSections, ...productSections, ...engineeringSections].map((section) => (
              <WorkspaceSection
                key={section.key}
                eyebrow={section.eyebrow}
                title={section.title}
              >
                <SignalList items={section.signals} />
              </WorkspaceSection>
            ))}
          </section>
        </section>
      </main>
    </TeamOptixShell>
  );
}
