"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import IdentityPill from "@/features/access/components/IdentityPill";
import { useAccess } from "@/features/access/AccessProvider";

function NavLink(props: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = pathname === props.href || pathname.startsWith(`${props.href}/`);

  return (
    <Link
      href={props.href}
      style={{
        color: active ? "var(--ink)" : undefined,
        fontWeight: active ? 900 : undefined,
      }}
      aria-current={active ? "page" : undefined}
    >
      {props.children}
    </Link>
  );
}

export default function SiteHeader() {
  const access = useAccess();

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link className="brand-mark" href={access.is_platform_owner ? "/teamoptix" : "/"}>
          <span className="brand-mark__kicker">TeamOptix</span>
          <span className="brand-mark__name">Insight</span>
        </Link>

        <div className="site-header__right">
          <nav className="site-nav" aria-label="Primary">
            {access.is_platform_owner ? (
              <>
                <NavLink href="/teamoptix/command-center">Command Center</NavLink>
                <NavLink href="/companies">Companies</NavLink>
                <NavLink href="/commercial">Commercial</NavLink>
                <NavLink href="/configuration">Configuration</NavLink>
              </>
            ) : (
              <NavLink href="/companies">Companies</NavLink>
            )}
            <NavLink href="/profile">Profile</NavLink>
          </nav>

          <IdentityPill />
        </div>
      </div>
    </header>
  );
}
