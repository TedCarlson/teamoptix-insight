import Link from "next/link";

export default function CompanySetupPage() {
  return (
    <main className="page-shell">
      <section className="panel">
        <p className="eyebrow">Company</p>
        <h1>Company setup</h1>
        <p className="lede">
          You are signed in and your profile is active. The next likely step is
          creating your first company workspace, but you do not have to do that
          right now.
        </p>

        <div className="cta-row" style={{ marginTop: 24 }}>
          <a className="button button-primary" href="#">
            Create company
          </a>
          <Link className="button" href="/profile">
            Not right now
          </Link>
        </div>
      </section>
    </main>
  );
}
