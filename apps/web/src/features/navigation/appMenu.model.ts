import type { AppMenuSection } from "./appMenu.types";

export function buildCompanyMenu(params: {
  slug: string;
  isAdminUser: boolean;
}): AppMenuSection[] {
  const { slug, isAdminUser } = params;
  const base = `/company/${slug}`;

  if (!isAdminUser) {
    return [
      {
        key: "my-work",
        label: "My Work",
        items: [
          { key: "home", label: "Home", href: `${base}/home` },
          { key: "schedule", label: "My Schedule", href: `${base}/schedule` },
          { key: "announcements", label: "Announcements", href: `${base}/announcements` },
        ],
      },
      {
        key: "account",
        label: "Account",
        items: [{ key: "switch-company", label: "Switch Company", href: "/companies" }],
      },
    ];
  }

  return [
    {
      key: "workspace",
      label: "Workspace",
      items: [
        { key: "home", label: "Home", href: `${base}/home` },
        { key: "admin-profile", label: "Admin Profile", href: base },
        { key: "payroll", label: "Payroll", href: `${base}/payroll` },
        { key: "analytics", label: "Analytics", href: `${base}/analytics` },
      ],
    },
    {
      key: "operations",
      label: "Operations",
      items: [
        { key: "dispatch", label: "Dispatch", href: `${base}/operations/dispatch` },
        { key: "delivery-window", label: "Delivery Window", href: `${base}/operations/delivery-window` },
        { key: "planning", label: "Planning", href: `${base}/operations/planning` },
        { key: "ops-reports", label: "Ops Reports", href: `${base}/prior-day` },
      ],
    },
    {
      key: "people",
      label: "People",
      items: [
        { key: "roster", label: "Roster", href: `${base}/people` },
        { key: "hiring", label: "Hiring", href: `${base}/hiring` },
        { key: "compliance", label: "Compliance", href: `${base}/people/compliance` },
      ],
    },
    {
      key: "schedule",
      label: "Schedule",
      items: [
        { key: "calendar", label: "Calendar", href: `${base}/schedule` },
        { key: "workbench", label: "Workbench", href: `${base}/schedule/generated` },
        { key: "overrides", label: "Overrides", href: `${base}/schedule/overrides` },
        { key: "presets", label: "Presets", href: `${base}/schedule/presets` },
      ],
    },
    {
      key: "administration",
      label: "Administration",
      items: [
        { key: "config", label: "Company Config", href: `${base}/config` },
        { key: "automation", label: "Automation", href: `${base}/config/automation` },
        { key: "access", label: "Access", href: `${base}/config/access` },
        { key: "assets", label: "Assets", href: `${base}/assets` },
        { key: "routes", label: "Routes", href: `${base}/routes` },
        { key: "switch-company", label: "Switch Company", href: "/companies" },
      ],
    },
  ];
}
