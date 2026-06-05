"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import IdentityPill from "@/features/access/components/IdentityPill";

type CompanyBranchNavProps = {
  slug: string;
};

type NavItem = {
  label: string;
  href: string;
  match: (pathname: string) => boolean;
};

export default function CompanyBranchNav(props: CompanyBranchNavProps) {
  const { slug } = props;
  const pathname = usePathname() ?? "";

  const base = `/company/${slug}`;
  const scheduleBase = `${base}/schedule`;

  const mainItems: NavItem[] = [
    { label: "Overview", href: base, match: (path) => path === base },
    { label: "People", href: `${base}/people`, match: (path) => path.startsWith(`${base}/people`) },
    { label: "Hiring", href: `${base}/hiring`, match: (path) => path.startsWith(`${base}/hiring`) },
    { label: "Schedule", href: `${base}/schedule`, match: (path) => path.startsWith(`${base}/schedule`) },
    { label: "Dispatch", href: `${base}/dispatch`, match: (path) => path.startsWith(`${base}/dispatch`) },
    { label: "Routes", href: `${base}/routes`, match: (path) => path.startsWith(`${base}/routes`) },
  ];

  const inScheduleBranch =
    pathname === scheduleBase || pathname.startsWith(`${scheduleBase}/`);

  const scheduleSubItems: NavItem[] = [
    { label: "Calendar", href: `${base}/schedule`, match: (path) => path === `${base}/schedule` },
    { label: "Workbench", href: `${base}/schedule/generated`, match: (path) => path === `${base}/schedule/generated` },
    { label: "Overrides", href: `${base}/schedule/overrides`, match: (path) => path.startsWith(`${base}/schedule/overrides`) },
    { label: "Presets", href: `${base}/schedule/presets`, match: (path) => path.startsWith(`${base}/schedule/presets`) },
  ];

  return (
    <nav className="app-nav-shell" aria-label="Company workspace">
      <div className="app-nav-inner">
        <Link className="brand-mark" href="/">
          <span className="brand-mark__kicker">TeamOptix</span>
          <span className="brand-mark__name">Insight</span>
        </Link>

        <div className="app-nav-group">
          <Link href="/companies" className="app-nav-pill">
            Companies
          </Link>

          {mainItems.map((item) => {
            const active = item.match(pathname);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`app-nav-pill${active ? " app-nav-pill--active" : ""}`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>

        <IdentityPill />
      </div>

      {inScheduleBranch ? (
        <div className="company-subnav">
          {scheduleSubItems.map((item) => {
            const active = item.match(pathname);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`app-nav-pill${active ? " app-nav-pill--active" : ""}`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      ) : null}
    </nav>
  );
}
