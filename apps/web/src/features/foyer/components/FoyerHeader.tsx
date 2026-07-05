import Link from "next/link";

export default function FoyerHeader() {
  return (
    <header className="foyer-header">
      <Link className="foyer-brand" href="/">
        <span>Team Optix</span>
        <small>Built for Operators</small>
      </Link>

      <nav className="foyer-nav" aria-label="Public navigation">
        <Link href="/company-owner">Contractors</Link>
        <Link href="/drivers">Drivers</Link>
        <Link href="/explore">Explore</Link>
        <Link href="/teamoptix">About</Link>
      </nav>

      <Link className="foyer-signin" href="/sign-in">
        Sign In
      </Link>
    </header>
  );
}
