"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import IdentityPill from "@/features/access/components/IdentityPill";
import { useAccess } from "@/features/access/AccessProvider";
import AppNavigationDrawer from "@/features/navigation/AppNavigationDrawer";
import { buildCompanyMenu } from "@/features/navigation/appMenu.model";

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
  const isDriverShellRoute =
    pathname === `/company/${slug}/home` ||
    pathname.startsWith(`/company/${slug}/driver/`);

  const access = useAccess();
  const [drawerOpen, setDrawerOpen] = useState(false);

  if (isDriverShellRoute) {
    return null;
  }
  const membership = access.memberships.find((item) => item.company_slug === slug) ?? null;
  const isAdminUser =
    Boolean(access.is_platform_owner) ||
    (membership?.relationship_type === "admin" && membership?.membership_status === "active");

  const menuSections = buildCompanyMenu({ slug, isAdminUser });

  const base = `/company/${slug}`;
  const homeBase = `${base}/home`;
  const announcementsBase = `${base}/announcements`;
  const peopleBase = `${base}/people`;
  const scheduleBase = `${base}/schedule`;
  const operationsBase = `${base}/operations`;
  const configBase = `${base}/config`;
  const assetsBase = `${base}/assets`;
  const payrollBase = `${base}/payroll`;

  const mainItems: NavItem[] = isAdminUser
    ? [
        { label: "Home", href: homeBase, match: (path) => path === homeBase || path.startsWith(announcementsBase) },
        { label: "Admin", href: base, match: (path) => path === base || path === `${base}/analytics` || path === `${base}/readiness` },
        { label: "Operations", href: operationsBase, match: (path) => path.startsWith(operationsBase) || path.startsWith(`${base}/dispatch`) || path === `${base}/prior-day` },
        { label: "Payroll", href: payrollBase, match: (path) => path.startsWith(payrollBase) },
        { label: "People", href: peopleBase, match: (path) => path.startsWith(peopleBase) || path.startsWith(`${base}/hiring`) },
        { label: "Schedule", href: scheduleBase, match: (path) => path.startsWith(scheduleBase) },
        { label: "Routes", href: `${base}/routes`, match: (path) => path.startsWith(`${base}/routes`) },
        { label: "Assets", href: `${assetsBase}/scanners`, match: (path) => path.startsWith(assetsBase) },
        { label: "Config", href: configBase, match: (path) => path.startsWith(configBase) },
      ]
    : [
        { label: "Home", href: homeBase, match: (path) => path === homeBase || path.startsWith(announcementsBase) },
        { label: "Schedule", href: scheduleBase, match: (path) => path.startsWith(scheduleBase) },
      ];

  const overviewSubItems: NavItem[] = [
    { label: "Profile", href: base, match: (path) => path === base },
    { label: "Analytics", href: `${base}/analytics`, match: (path) => path === `${base}/analytics` || path === `${base}/readiness` },
  ];

  const payrollSubItems: NavItem[] = [
    { label: "Summary", href: `${payrollBase}/summary`, match: (path) => path === payrollBase || path === `${payrollBase}/summary` },
    { label: "Adjustments", href: `${payrollBase}/adjustments`, match: (path) => path === `${payrollBase}/adjustments` },
    { label: "Productivity", href: `${payrollBase}/productivity`, match: (path) => path === `${payrollBase}/productivity` || path.startsWith(`${payrollBase}/productivity/`) },
    { label: "Time Tracking", href: `${payrollBase}/time-tracking`, match: (path) => path === `${payrollBase}/time-tracking` || path.startsWith(`${payrollBase}/time-tracking/`) },
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
    { label: "Ops Reports", href: `${base}/prior-day`, match: (path) => path === `${base}/prior-day` },
  ];

  const homeSubItems: NavItem[] = [
    { label: "Company Home", href: homeBase, match: (path) => path === homeBase },
    { label: "Announcements", href: announcementsBase, match: (path) => path.startsWith(announcementsBase) },
  ];

  const configSubItems: NavItem[] = [
    { label: "Company", href: configBase, match: (path) => path === configBase || path === `${configBase}/company` },
    { label: "Leadership", href: `${configBase}/leadership`, match: (path) => path === `${configBase}/leadership` },
    { label: "Access", href: `${configBase}/access`, match: (path) => path === `${configBase}/access` },
    { label: "Operations", href: `${configBase}/operations`, match: (path) => path === `${configBase}/operations` },
    { label: "Automation", href: `${configBase}/automation`, match: (path) => path === `${configBase}/automation` },
  ];

  const assetsSubItems: NavItem[] = [
    { label: "Scanners", href: `${assetsBase}/scanners`, match: (path) => path === assetsBase || path === `${assetsBase}/scanners` },
    { label: "Fuel Cards", href: `${assetsBase}/fuel-cards`, match: (path) => path === `${assetsBase}/fuel-cards` },
    { label: "Asset Audit", href: `${assetsBase}/audit`, match: (path) => path === `${assetsBase}/audit` },
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
  const inAssetsBranch = pathname === assetsBase || pathname.startsWith(`${assetsBase}/`);
  const inPayrollBranch = pathname === payrollBase || pathname.startsWith(`${payrollBase}/`);


  const subItems = !isAdminUser
    ? inHomeBranch
      ? homeSubItems
      : inScheduleBranch
        ? [{ label: "My Schedule", href: scheduleBase, match: (path: string) => path === scheduleBase }]
        : []
    : inHomeBranch
      ? homeSubItems
      : inPayrollBranch
        ? payrollSubItems
        : inAssetsBranch
        ? assetsSubItems
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
        <button
          type="button"
          className="app-menu-button"
          aria-label="Open navigation menu"
          onClick={() => setDrawerOpen(true)}
        >
          ☰
        </button>

        <Link className="brand-mark" href="/">
          <span className="brand-mark__kicker">TeamOptix</span>
          <span className="brand-mark__name">Insight</span>
        </Link>

        <IdentityPill />
      </div>

      <div className="app-workspace-rail">
        {mainItems.map((item) => {
          const active = item.match(pathname);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`app-workspace-tile${active ? " app-workspace-tile--active" : ""}`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>

      <AppNavigationDrawer
        open={drawerOpen}
        pathname={pathname}
        sections={menuSections}
        onClose={() => setDrawerOpen(false)}
      />

      {subItems.length > 0 ? (
        <div className="app-workspace-rail app-workspace-rail--surfaces" aria-label="Workspace surfaces">
          {subItems.map((item) => {
            const active = item.match(pathname);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`app-workspace-tile app-workspace-tile--surface${active ? " app-workspace-tile--active" : ""}`}
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
