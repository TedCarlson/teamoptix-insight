"use client";

import TeamOptixShell from "@/features/teamoptix/navigation/TeamOptixShell";
import { WorkspaceHeader, WorkspaceSection } from "@/features/ui/workspace";
import { SignalList } from "@/features/ui/signals";
import type { TeamOptixRegistrySection } from "@/features/teamoptix/registry";

type Props = {
  eyebrow: string;
  title: string;
  description?: string;
  sections: TeamOptixRegistrySection[];
};

export default function TeamOptixWorkspacePage({
  eyebrow,
  title,
  description,
  sections,
}: Props) {
  return (
    <TeamOptixShell>
      <main className="workspace-shell">
        <section className="workspace-main">

          <WorkspaceHeader
            eyebrow={eyebrow}
            title={title}
            description={description}
          />

          <section className="teamoptix-console">
            {sections.map((section) => (
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
