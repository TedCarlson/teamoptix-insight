import Link from "next/link";

export default function FoyerHeader() {
  return (
    <header className="foyer-header">
      <Link className="foyer-brand" href="/">
        <span>Team Optix</span>
        <small>Built for Operators. By Operators.</small>
      </Link>

      <nav className="foyer-nav" aria-label="Public navigation">
        <Link href="/explore">Insight</Link>
        <Link href="/company-owner">Operators</Link>
        <Link href="/teams">Teams</Link>
        <Link href="/teamoptix">Company</Link>
      </nav>

      <Link className="foyer-signin" href="/sign-in">
        Insight User Sign In
      </Link>
    </header>
  );
}
