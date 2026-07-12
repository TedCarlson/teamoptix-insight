"use client";

export default function CompanyAnnouncementsPage() {
  return (
    <main className="workspace-shell">
      <section className="workspace-main" style={{ paddingTop: 0, paddingBottom: 24 }}>
        <section className="app-card" style={{ padding: 16, marginBottom: 10 }}>
          <p className="value-card__eyebrow">Company announcements</p>
          <h1 className="workspace-title">Message board</h1>
          <p className="app-card__body" style={{ marginTop: 6 }}>
            A company-wide communication surface for operational updates, reminders, and general notices.
          </p>
        </section>

        <section className="company-announcements-layout">
          <section className="app-card company-announcements-feed">
            <p className="value-card__eyebrow">Feed</p>
            <h2 className="app-card__title">No announcements yet</h2>
            <p className="app-card__body" style={{ marginTop: 4 }}>
              Announcements will appear here once the company message board is wired to persistence.
            </p>
          </section>

          <aside className="app-card company-announcements-sidebar">
            <p className="value-card__eyebrow">Coming next</p>
            <h2 className="app-card__title">Communication controls</h2>
            <p className="app-card__body" style={{ marginTop: 4 }}>
              Later this can support pinned posts, read receipts, audience targeting, and admin posting controls.
            </p>
            <div className="cta-row" style={{ marginTop: 12 }}>
              <button className="button" type="button" disabled>
                Draft message
              </button>
            </div>
          </aside>
        </section>
      </section>
    </main>
  );
}
