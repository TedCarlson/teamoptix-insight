import Link from "next/link";

export default function FoyerHeader() {
  return (
    <header className="foyer-header">
      <Link className="foyer-brand" href="/">
        <span>Team Optix</span>
        <small>Built for Operators</small>
      </Link>

      <nav className="foyer-nav" aria-label="Public navigation">
        <Link href="/company-owner">I Own a Company</Link>
        <Link href="/employee">I Work Here</Link>
        <Link href="/explore">Explore Insight</Link>
        <Link href="/teamoptix">About Team Optix</Link>
      </nav>

      <Link className="foyer-signin" href="/sign-in">
        Sign In
      </Link>
    </header>
  );
}
