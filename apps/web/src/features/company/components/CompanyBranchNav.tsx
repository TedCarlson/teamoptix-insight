"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import IdentityPill from "@/features/access/components/IdentityPill";
import { useAccess } from "@/features/access/AccessProvider";

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
  const [legalActionCount, setLegalActionCount] = useState(0);

  useEffect(() => {
    let active = true;

    async function loadLegalSignal() {
      try {
        const res = await fetch(`/api/company/${slug}/legal/tasks`, {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        });
        const data = await res.json();

        if (!active) return;

        setLegalActionCount(
          res.ok ? Number(data?.customer_action_count ?? 0) || 0 : 0
        );
      } catch {
        if (active) setLegalActionCount(0);
      }
    }

    if (slug) void loadLegalSignal();

    return () => {
      active = false;
    };
  }, [slug]);

  if (isDriverShellRoute) {
    return null;
  }
  const membership = access.memberships.find((item) => item.company_slug === slug) ?? null;
  const isAdminUser =
    Boolean(access.is_platform_owner) ||
    (membership?.relationship_type === "admin" && membership?.membership_status === "active");
  const canAccessOpportunities =
    Boolean(access.is_platform_owner) ||
    (membership?.membership_status === "active" &&
      (membership.relationship_type === "admin" ||
        membership.grants?.includes("opportunity_analysis")));

  const base = `/company/${slug}`;
  const announcementsBase = `${base}/announcements`;
  const homeBase = announcementsBase;
  const driverHomeBase = `${base}/home`;
  const peopleBase = `${base}/people`;
  const scheduleBase = `${base}/schedule`;
  const operationsBase = `${base}/operations`;
  const configBase = `${base}/config`;
  const assetsBase = `${base}/assets`;
  const payrollBase = `${base}/payroll`;
  const billingBase = `${base}/billing`;
  const analyticsBase = `${base}/analytics`;
  const opportunitiesBase = `${base}/opportunity-analysis`;
  const fleetBase = `${base}/fleet`;
  const legalRequiredBase = `${base}/admin/legal/required`;

  const mainItems: NavItem[] = isAdminUser
    ? [
        { label: "Home", href: homeBase, match: (path) => path === homeBase || path.startsWith(announcementsBase) },
        {
          label: "Admin",
          href: base,
          match: (path) =>
            path === base ||
            path.startsWith(analyticsBase) ||
            path === `${base}/readiness` ||
            path.startsWith(`${base}/admin/legal`) ||
            path.startsWith(billingBase) ||
            path.startsWith(payrollBase) ||
            path.startsWith(assetsBase) ||
            path === configBase ||
            path.startsWith(`${configBase}/`),
        },
        { label: "Operations", href: operationsBase, match: (path) => path.startsWith(operationsBase) || path.startsWith(`${base}/dispatch`) || path === `${base}/prior-day` },
        { label: "People", href: peopleBase, match: (path) => path.startsWith(peopleBase) || path.startsWith(`${base}/hiring`) },
        { label: "Schedule", href: scheduleBase, match: (path) => path.startsWith(scheduleBase) },
        { label: "Fleet", href: fleetBase, match: (path) => path.startsWith(fleetBase) },
        { label: "Routes", href: `${base}/routes`, match: (path) => path.startsWith(`${base}/routes`) },
        ...(canAccessOpportunities
          ? [{ label: "Opportunities", href: opportunitiesBase, match: (path: string) => path.startsWith(opportunitiesBase) }]
          : []),
      ]
    : [
        { label: "Home", href: homeBase, match: (path) => path === homeBase || path.startsWith(announcementsBase) },
        { label: "Schedule", href: scheduleBase, match: (path) => path.startsWith(scheduleBase) },
        ...(canAccessOpportunities
          ? [{ label: "Opportunities", href: opportunitiesBase, match: (path: string) => path.startsWith(opportunitiesBase) }]
          : []),
      ];

  const overviewSubItems: NavItem[] = [
    ...(legalActionCount > 0
      ? [
          {
            label: `Signature Required (${legalActionCount})`,
            href: legalRequiredBase,
            match: (path: string) => path.startsWith(`${base}/admin/legal`),
          },
        ]
      : []),
    {
      label: "Analytics",
      href: analyticsBase,
      match: (path) =>
        path.startsWith(analyticsBase) ||
        path === `${base}/readiness`,
    },
    { label: "Billing", href: billingBase, match: (path) => path.startsWith(billingBase) },
    { label: "Payroll", href: payrollBase, match: (path) => path.startsWith(payrollBase) },
    { label: "Assets", href: `${assetsBase}/scanners`, match: (path) => path.startsWith(assetsBase) },
    { label: "Config", href: configBase, match: (path) => path === configBase || path.startsWith(`${configBase}/`) },
  ];

  const analyticsSubItems: NavItem[] = [
    {
      label: "Dashboard",
      href: analyticsBase,
      match: (path) =>
        path === analyticsBase ||
        path === `${base}/readiness`,
    },
    {
      label: "Operations",
      href: `${analyticsBase}/operations`,
      match: (path) => path.startsWith(`${analyticsBase}/operations`),
    },
    {
      label: "Workforce",
      href: `${analyticsBase}/workforce`,
      match: (path) => path.startsWith(`${analyticsBase}/workforce`),
    },
    {
      label: "Driver Scorecards",
      href: `${analyticsBase}/driver-scorecards`,
      match: (path) =>
        path.startsWith(`${analyticsBase}/driver-scorecards`),
    },
    {
      label: "Route Intelligence",
      href: `${analyticsBase}/routes`,
      match: (path) => path.startsWith(`${analyticsBase}/routes`),
    },
    {
      label: "Territory",
      href: `${analyticsBase}/territory`,
      match: (path) => path.startsWith(`${analyticsBase}/territory`),
    },
    {
      label: "Commercial",
      href: `${analyticsBase}/commercial`,
      match: (path) => path.startsWith(`${analyticsBase}/commercial`),
    },
    {
      label: "Historical",
      href: `${analyticsBase}/historical`,
      match: (path) => path.startsWith(`${analyticsBase}/historical`),
    },
    {
      label: "Exports",
      href: `${analyticsBase}/exports`,
      match: (path) => path.startsWith(`${analyticsBase}/exports`),
    },
  ];

  const opportunitySubItems: NavItem[] = [
    { label: "Opportunities", href: opportunitiesBase, match: (path) => path === opportunitiesBase },
    { label: "New Analysis", href: `${opportunitiesBase}/new`, match: (path) => path.startsWith(`${opportunitiesBase}/new`) },
    { label: "Comparisons", href: `${opportunitiesBase}/comparisons`, match: (path) => path.startsWith(`${opportunitiesBase}/comparisons`) },
    { label: "Assumptions", href: `${opportunitiesBase}/assumptions`, match: (path) => path.startsWith(`${opportunitiesBase}/assumptions`) },
    { label: "Reference Data", href: `${opportunitiesBase}/reference-data`, match: (path) => path.startsWith(`${opportunitiesBase}/reference-data`) },
  ];

  const payrollSubItems: NavItem[] = [
    { label: "Summary", href: `${payrollBase}/summary`, match: (path) => path === payrollBase || path === `${payrollBase}/summary` },
    { label: "Compliance", href: `${payrollBase}/compliance`, match: (path) => path === `${payrollBase}/compliance` },
    { label: "Adjustments", href: `${payrollBase}/adjustments`, match: (path) => path === `${payrollBase}/adjustments` },
    { label: "Productivity", href: `${payrollBase}/productivity`, match: (path) => path === `${payrollBase}/productivity` || path.startsWith(`${payrollBase}/productivity/`) },
    { label: "Time Tracking", href: `${payrollBase}/time-tracking`, match: (path) => path === `${payrollBase}/time-tracking` || path.startsWith(`${payrollBase}/time-tracking/`) },
  ];

  const peopleSubItems: NavItem[] = [
    { label: "Roster", href: peopleBase, match: (path) => path === peopleBase || path.startsWith(`${peopleBase}/roster`) || path.startsWith(`${peopleBase}/active`) || path.startsWith(`${peopleBase}/former`) || path.startsWith(`${peopleBase}/import`) },
    { label: "Import", href: `${peopleBase}/import`, match: (path) => path.startsWith(`${peopleBase}/import`) },
    { label: "Hiring", href: `${base}/hiring`, match: (path) => path.startsWith(`${base}/hiring`) },
    { label: "Invitations", href: `${peopleBase}/invitations`, match: (path) => path.startsWith(`${peopleBase}/invitations`) },
    { label: "Interviews", href: `${peopleBase}/interviews`, match: (path) => path.startsWith(`${peopleBase}/interviews`) },
    { label: "Requirements", href: `${peopleBase}/requirements`, match: (path) => path.startsWith(`${peopleBase}/requirements`) },
    { label: "Compliance", href: `${peopleBase}/compliance`, match: (path) => path.startsWith(`${peopleBase}/compliance`) },
    { label: "Policies", href: `${peopleBase}/policies`, match: (path) => path.startsWith(`${peopleBase}/policies`) },
    { label: "Corrective Actions", href: `${peopleBase}/corrective-actions`, match: (path) => path.startsWith(`${peopleBase}/corrective-actions`) },
    { label: "Reports", href: `${peopleBase}/reports`, match: (path) => path.startsWith(`${peopleBase}/reports`) },
  ];

  const scheduleSubItems: NavItem[] = [
    { label: "Calendar", href: scheduleBase, match: (path) => path === scheduleBase },
    { label: "Workbench", href: `${scheduleBase}/generated`, match: (path) => path === `${scheduleBase}/generated` },
    { label: "Overrides", href: `${scheduleBase}/overrides`, match: (path) => path.startsWith(`${scheduleBase}/overrides`) },
    { label: "Presets", href: `${scheduleBase}/presets`, match: (path) => path.startsWith(`${scheduleBase}/presets`) },
  ];

  const operationsSubItems: NavItem[] = [
    { label: "Dispatch", href: `${operationsBase}/dispatch`, match: (path) => path.startsWith(`${operationsBase}/dispatch`) || path.startsWith(`${base}/dispatch`) },
    { label: "Service", href: `${operationsBase}/service`, match: (path) => path.startsWith(`${operationsBase}/service`) || path.startsWith(`${operationsBase}/delivery-window`) },
    { label: "Planning", href: `${operationsBase}/planning`, match: (path) => path.startsWith(`${operationsBase}/planning`) || path.startsWith(`${operationsBase}/intelligence`) },
    { label: "Ops Reports", href: `${base}/prior-day`, match: (path) => path === `${base}/prior-day` },
  ];

  const fleetSubItems: NavItem[] = [
    { label: "Home", href: fleetBase, match: (path) => path === fleetBase },
    { label: "Vehicles", href: `${fleetBase}/vehicles`, match: (path) => path.startsWith(`${fleetBase}/vehicles`) },
    { label: "Maintenance", href: `${fleetBase}/maintenance`, match: (path) => path.startsWith(`${fleetBase}/maintenance`) },
    { label: "Inspections", href: `${fleetBase}/inspections`, match: (path) => path.startsWith(`${fleetBase}/inspections`) },
  ];

  const homeSubItems: NavItem[] = [
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
    pathname === homeBase ||
    pathname.startsWith(announcementsBase) ||
    pathname === driverHomeBase;

  const inPeopleBranch =
    pathname === peopleBase ||
    pathname.startsWith(`${peopleBase}/`) ||
    pathname.startsWith(`${base}/hiring`);

  const inScheduleBranch =
    pathname === scheduleBase || pathname.startsWith(`${scheduleBase}/`);

  const inOperationsBranch =
    pathname === operationsBase ||
    pathname.startsWith(`${operationsBase}/`) ||
    pathname.startsWith(`${base}/dispatch`) ||
    pathname === `${base}/prior-day`;

  const inAnalyticsBranch =
    pathname === analyticsBase ||
    pathname.startsWith(`${analyticsBase}/`) ||
    pathname === `${base}/readiness`;

  const inOpportunitiesBranch =
    pathname === opportunitiesBase || pathname.startsWith(`${opportunitiesBase}/`);

  const inConfigBranch = pathname === configBase || pathname.startsWith(`${configBase}/`);
  const inAssetsBranch = pathname === assetsBase || pathname.startsWith(`${assetsBase}/`);
  const inPayrollBranch = pathname === payrollBase || pathname.startsWith(`${payrollBase}/`);
  const inLegalBranch = pathname.startsWith(`${base}/admin/legal`);
  const inFleetBranch = pathname === fleetBase || pathname.startsWith(`${fleetBase}/`);


  const subItems = !isAdminUser
    ? inHomeBranch
      ? homeSubItems
      : inScheduleBranch
        ? [{ label: "My Schedule", href: scheduleBase, match: (path: string) => path === scheduleBase }]
        : []
    : inHomeBranch
      ? homeSubItems
      : inAnalyticsBranch
        ? analyticsSubItems
        : inOpportunitiesBranch
          ? opportunitySubItems
        : inPayrollBranch
          ? payrollSubItems
        : inAssetsBranch
        ? assetsSubItems
        : inConfigBranch
          ? configSubItems
          : inLegalBranch ||
            pathname === base ||
              pathname === `${base}/payroll` ||
              pathname === billingBase
            ? overviewSubItems
            : inPeopleBranch
              ? peopleSubItems
              : inScheduleBranch
                ? scheduleSubItems
                : inFleetBranch
                  ? fleetSubItems
                : inOperationsBranch
                  ? operationsSubItems
                  : [];

  return (
    <nav className="app-nav-shell" aria-label="Company workspace">
      <div className="app-nav-inner">
        <Link
          className="app-nav-brand"
          href={homeBase}
          aria-label="Open Insight workspace home"
        >
          <Image
            className="app-nav-brand__logo"
            src="/icons/logo-2-insight-cutout-xsm.png"
            alt=""
            width={320}
            height={208}
            priority
          />

          <span className="app-nav-brand__copy">
            <span className="app-nav-brand__product">Insight</span>
            <span className="app-nav-brand__owner">by Team Optix</span>
          </span>
        </Link>

        <div className="app-nav-actions">
          {access.is_platform_owner ? (
            <Link className="button" href="/teamoptix/command-center">
              My Workspace
            </Link>
          ) : null}

          <IdentityPill />
        </div>
      </div>

      <div className="app-workspace-rail">
        {mainItems.map((item) => {
          const active = item.match(pathname);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`app-workspace-tile${active ? " app-workspace-tile--active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              {item.label}
            </Link>
          );
        })}
      </div>

      {subItems.length > 0 ? (
        <div className="app-workspace-rail app-workspace-rail--surfaces" aria-label="Workspace surfaces">
          {subItems.map((item) => {
            const active = item.match(pathname);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`app-workspace-tile app-workspace-tile--surface${active ? " app-workspace-tile--active" : ""}`}
                aria-current={active ? "page" : undefined}
                style={
                  item.label.startsWith("Signature Required")
                    ? { background: "#fee2e2", borderColor: "#ef4444", color: "#991b1b" }
                    : undefined
                }
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
