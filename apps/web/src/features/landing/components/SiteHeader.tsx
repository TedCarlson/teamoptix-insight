import Link from "next/link";
import IdentityPill from "@/features/access/components/IdentityPill";

export default function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link className="brand-mark" href="/">
          <span className="brand-mark__kicker">TeamOptix</span>
          <span className="brand-mark__name">Insight</span>
        </Link>

        <div className="site-header__right">
          <nav className="site-nav" aria-label="Primary">
            <Link href="/sign-in">Sign in</Link>
            <Link href="/profile">Profile</Link>
            <Link href="/companies">Companies</Link>
          </nav>

          <IdentityPill />
        </div>
      </div>
    </header>
  );
}