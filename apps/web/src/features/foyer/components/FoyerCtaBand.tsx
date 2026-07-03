import Link from "next/link";

export default function FoyerCtaBand() {
  return (
    <section className="foyer-cta">
      <div>
        <p className="foyer-kicker">Let&apos;s build your workspace.</p>
        <h2>We&apos;ll help you see what&apos;s possible for your operation.</h2>
      </div>

      <div className="foyer-cta__actions">
        <Link className="button button-primary" href="/company-owner">
          Schedule an Introduction
        </Link>
        <Link className="button" href="/sign-in">
          Sign In
        </Link>
      </div>
    </section>
  );
}
