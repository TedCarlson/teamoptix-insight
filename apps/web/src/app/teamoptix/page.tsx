"use client";

import TeamOptixShell from "@/features/teamoptix/navigation/TeamOptixShell";
import { useAccess } from "@/features/access/AccessProvider";

function CommandCard(props: {
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <section className="app-card" style={{ padding: 16 }}>
      <p className="value-card__eyebrow">{props.eyebrow}</p>
      <h2 className="app-card__title">{props.title}</h2>
      <p className="app-card__body">{props.body}</p>
    </section>
  );
}

export default function TeamOptixCommandCenterPage() {
  const access = useAccess();

  const name =
    access.display_name ||
    access.first_name ||
    access.email ||
    "Platform Owner";

  return (
    <TeamOptixShell>
      <main className="workspace-shell">
        <section className="workspace-main">
          <section className="app-card" style={{ padding: 18 }}>
            <p className="value-card__eyebrow">TeamOptix</p>
            <h1 className="workspace-title">Good to see you, {name}</h1>
            <p className="workspace-subtitle">
              Run the business. Build the products.
            </p>
          </section>

          <section
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))",
              gap: 12,
              marginTop: 12,
            }}
          >
            <CommandCard
              eyebrow="Today's Focus"
              title="Projects"
              body="Workspace Standard, Time Keeping, Scorecards."
            />
            <CommandCard
              eyebrow="Products"
              title="Insight"
              body="Current flagship product and active development."
            />
            <CommandCard
              eyebrow="Customers"
              title="Client Priorities"
              body="Review requested enhancements and implementation progress."
            />
            <CommandCard
              eyebrow="Engineering"
              title="Platform Health"
              body="Repositories, deployments, runtime and automation."
            />
            <CommandCard
              eyebrow="Business"
              title="Sales & Marketing"
              body="Presentations, proposals, contracts and growth."
            />
            <CommandCard
              eyebrow="AI"
              title="Command Intelligence"
              body="Prompt library, assistants and evaluation workspace."
            />
          </section>
        </section>
      </main>
    </TeamOptixShell>
  );
}
