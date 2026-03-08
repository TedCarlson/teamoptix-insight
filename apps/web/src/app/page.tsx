export default function HomePage() {
  return (
    <main className="page-shell">
      <section className="hero-card">
        <p className="eyebrow">TeamOptix</p>
        <h1>Insight</h1>
        <p className="lede">
          Multi-industry operational intelligence platform with standalone company
          workspaces and platform-wide user identity.
        </p>

        <div className="cta-row">
          <a className="button button-primary" href="/sign-in">
            Sign in
          </a>
          <a className="button" href="/profile/setup">
            Create profile
          </a>
          <a className="button" href="/company/setup">
            Create company
          </a>
        </div>
      </section>
    </main>
  );
}
