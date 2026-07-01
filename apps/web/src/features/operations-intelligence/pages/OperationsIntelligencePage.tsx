"use client";

type Props = {
  slug: string;
};

export default function OperationsIntelligencePage({ slug }: Props) {
  return (
    <main className="workspace-shell">
      <section className="workspace-main" style={{ paddingTop: 8 }}>
        <section className="app-card" style={{ display: "grid", gap: 10 }}>
          <div>
            <p className="value-card__eyebrow">Operations Intelligence</p>
            <h1 className="workspace-title">Overview</h1>
            <p className="workspace-subtitle">
              Evidence-first operating context for routes, drivers, volume, and execution signals.
            </p>
          </div>

          <div
            style={{
              border: "1px dashed #cbd5e1",
              borderRadius: 14,
              padding: 14,
              background: "#f8fafc",
              color: "#475569",
              fontSize: 13,
              fontWeight: 850,
            }}
          >
            Intelligence Engine foundation mounted for {slug}. Next slice wires existing DSW and DRO evidence.
          </div>
        </section>
      </section>
    </main>
  );
}
