"use client";

import Link from "next/link";
import IdentityPill from "@/features/access/components/IdentityPill";
import { useAccess } from "@/features/access/AccessProvider";

export default function SiteHeader() {
  const access = useAccess();

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link className="brand-mark" href={access.is_platform_owner ? "/command-center" : "/"}>
          <span className="brand-mark__kicker">TeamOptix</span>
          <span className="brand-mark__name">Insight</span>
        </Link>

        <div className="site-header__right">
          <nav className="site-nav" aria-label="Primary">
            {access.is_platform_owner ? (
              <Link href="/command-center">Command Center</Link>
            ) : null}
            <Link href="/companies">Companies</Link>
            {access.is_platform_owner ? (
              <>
                <Link href="/commercial">Commercial</Link>
                <Link href="/configuration">Configuration</Link>
              </>
            ) : null}
            <Link href="/profile">Profile</Link>
          </nav>

          <IdentityPill />
        </div>
      </div>
    </header>
  );
}
