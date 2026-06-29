import TeamOptixShell from "@/features/teamoptix/navigation/TeamOptixShell";

export default function TeamOptixWorkspacePage() {
  return (
    <TeamOptixShell>
      <main className="workspace-shell">
        <section className="workspace-main">
          <section className="app-card" style={{ padding: 18 }}>
            <p className="value-card__eyebrow">TeamOptix · Automation</p>
            <h1 className="workspace-title">Runner Fleet</h1>
            <p className="workspace-subtitle">Monitor runners, capacity, health, and environments.</p>
          </section>

          <section className="app-card" style={{ padding: 16 }}>
            <p className="value-card__eyebrow">Workspace</p>
            <h2 className="app-card__title">Foundation ready</h2>
            <p className="app-card__body">
              This workspace is scaffolded and ready for the next focused pass.
            </p>
          </section>
        </section>
      </main>
    </TeamOptixShell>
  );
}
