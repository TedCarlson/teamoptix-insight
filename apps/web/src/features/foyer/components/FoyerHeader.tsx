import Link from "next/link";

export default function FoyerHeader() {
  return (
    <header className="foyer-header brand-site-header">
      <Link className="foyer-brand brand-site-brand" href="/" aria-label="Team Optix home">
        <span>Team Optix</span>
        <small>Built for Operators. By Operators.</small>
      </Link>

      <nav className="foyer-nav brand-site-nav" aria-label="Public navigation">
        <Link href="/insight">Products</Link>
        <Link href="/insight#workflows">Solutions</Link>
        <Link href="/company-owner">For Operators</Link>
        <Link href="/company">Company</Link>
      </nav>

      <div className="brand-site-actions">
        <Link className="brand-site-signin" href="/sign-in">
          Sign in
        </Link>
        <Link className="brand-site-primary" href="/insight">
          See Insight
        </Link>
      </div>
    </header>
  );
}
