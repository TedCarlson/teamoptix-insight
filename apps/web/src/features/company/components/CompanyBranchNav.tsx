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
  const homeBase = `${base}/home`;
  const announcementsBase = `${base}/announcements`;
  const peopleBase = `${base}/people`;
  const scheduleBase = `${base}/schedule`;
  const operationsBase = `${base}/operations`;
  const configBase = `${base}/config`;

  const mainItems: NavItem[] = [
    { label: "Home", href: homeBase, match: (path) => path === homeBase || path.startsWith(announcementsBase) },
    { label: "Admin", href: base, match: (path) => path === base || path.startsWith(configBase) },
    { label: "Operations", href: operationsBase, match: (path) => path.startsWith(operationsBase) || path.startsWith(`${base}/dispatch`) },
    { label: "Schedule", href: scheduleBase, match: (path) => path.startsWith(scheduleBase) },
    { label: "People", href: peopleBase, match: (path) => path.startsWith(peopleBase) || path.startsWith(`${base}/hiring`) },
    { label: "Routes", href: `${base}/routes`, match: (path) => path.startsWith(`${base}/routes`) },
  ];

  const overviewSubItems: NavItem[] = [
    { label: "Profile", href: base, match: (path) => path === base },
    { label: "Payroll", href: `${base}/payroll`, match: (path) => path === `${base}/payroll` },
    { label: "Ops Reports", href: `${base}/prior-day`, match: (path) => path === `${base}/prior-day` },
    { label: "Analytics", href: `${base}/analytics`, match: (path) => path === `${base}/analytics` || path === `${base}/readiness` },
    { label: "Config", href: configBase, match: (path) => path.startsWith(configBase) },
  ];

  const peopleSubItems: NavItem[] = [
    { label: "Roster", href: peopleBase, match: (path) => path === peopleBase || path.startsWith(`${peopleBase}/roster`) || path.startsWith(`${peopleBase}/active`) || path.startsWith(`${peopleBase}/former`) || path.startsWith(`${peopleBase}/import`) },
    { label: "Import", href: `${peopleBase}/import`, match: (path) => path.startsWith(`${peopleBase}/import`) },
    { label: "Hiring", href: `${base}/hiring`, match: (path) => path.startsWith(`${base}/hiring`) },
    { label: "Compliance", href: `${peopleBase}/compliance`, match: (path) => path.startsWith(`${peopleBase}/compliance`) },
    { label: "Reports", href: `${peopleBase}/reports`, match: (path) => path.startsWith(`${peopleBase}/reports`) },
  ];

  const scheduleSubItems: NavItem[] = [
    { label: "Calendar", href: scheduleBase, match: (path) => path === scheduleBase },
    { label: "Workbench", href: `${scheduleBase}/generated`, match: (path) => path === `${scheduleBase}/generated` },
    { label: "Overrides", href: `${scheduleBase}/overrides`, match: (path) => path.startsWith(`${scheduleBase}/overrides`) },
    { label: "Presets", href: `${scheduleBase}/presets`, match: (path) => path.startsWith(`${scheduleBase}/presets`) },
  ];

  const operationsSubItems: NavItem[] = [
    { label: "Dispatch", href: `${operationsBase}/dispatch`, match: (path) => path === operationsBase || path.startsWith(`${operationsBase}/dispatch`) || path.startsWith(`${base}/dispatch`) },
    { label: "Delivery Window", href: `${operationsBase}/delivery-window`, match: (path) => path.startsWith(`${operationsBase}/delivery-window`) },
    { label: "Planning", href: `${operationsBase}/planning`, match: (path) => path.startsWith(`${operationsBase}/planning`) },
  ];

  const homeSubItems: NavItem[] = [
    { label: "Company Home", href: homeBase, match: (path) => path === homeBase },
    { label: "Announcements", href: announcementsBase, match: (path) => path.startsWith(announcementsBase) },
  ];

  const configSubItems: NavItem[] = [
    { label: "Back to Admin", href: base, match: () => false },
    { label: "Company", href: configBase, match: (path) => path === configBase || path === `${configBase}/company` },
    { label: "Leadership", href: `${configBase}/leadership`, match: (path) => path === `${configBase}/leadership` },
    { label: "Access", href: `${configBase}/access`, match: (path) => path === `${configBase}/access` },
    { label: "Operations", href: `${configBase}/operations`, match: (path) => path === `${configBase}/operations` },
    { label: "Automation", href: `${configBase}/automation`, match: (path) => path === `${configBase}/automation` },
  ];

  const inHomeBranch =
    pathname === homeBase || pathname.startsWith(`${homeBase}/`) || pathname.startsWith(announcementsBase);

  const inPeopleBranch =
    pathname === peopleBase ||
    pathname.startsWith(`${peopleBase}/`) ||
    pathname.startsWith(`${base}/hiring`);

  const inScheduleBranch =
    pathname === scheduleBase || pathname.startsWith(`${scheduleBase}/`);

  const inOperationsBranch =
    pathname === operationsBase ||
    pathname.startsWith(`${operationsBase}/`) ||
    pathname.startsWith(`${base}/dispatch`);

  const inConfigBranch = pathname === configBase || pathname.startsWith(`${configBase}/`);

  const subItems = inHomeBranch
    ? homeSubItems
    : inConfigBranch
    ? configSubItems
    : pathname === base ||
        pathname === `${base}/payroll` ||
        pathname === `${base}/prior-day` ||
        pathname === `${base}/analytics` ||
  pathname === `${base}/readiness`
      ? overviewSubItems
      : inPeopleBranch
        ? peopleSubItems
        : inScheduleBranch
          ? scheduleSubItems
          : inOperationsBranch
            ? operationsSubItems
            : [];

  return (
    <nav className="app-nav-shell" aria-label="Company workspace">
      <div className="app-nav-inner">
        <Link className="brand-mark" href="/">
          <span className="brand-mark__kicker">TeamOptix</span>
          <span className="brand-mark__name">Insight</span>
        </Link>

        <div className="app-nav-group">
          <Link href="/companies" className="app-nav-pill">
            Switch Company
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

      {subItems.length > 0 ? (
        <div className="company-subnav">
          {subItems.map((item) => {
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
