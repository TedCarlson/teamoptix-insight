import type { AppMenuSection } from "../appMenu.types";

export function buildAdministrationMenu(base: string): AppMenuSection {
  return {
    key: "administration",
    label: "Administration",
    items: [
      { key: "profile", label: "Profile", href: base },
      {
        key: "payroll",
        label: "Payroll",
        href: `${base}/payroll`,
        children: [
          { key: "payroll-summary", label: "Summary", href: `${base}/payroll/summary` },
          { key: "payroll-adjustments", label: "Adjustments", href: `${base}/payroll/adjustments` },
          { key: "payroll-productivity", label: "Productivity", href: `${base}/payroll/productivity` },
          { key: "payroll-time-tracking", label: "Time Tracking", href: `${base}/payroll/time-tracking` },
        ],
      },
      { key: "ops-reports", label: "Ops Reports", href: `${base}/prior-day` },
      { key: "analytics", label: "Analytics", href: `${base}/analytics` },
      {
        key: "config",
        label: "Company Config",
        href: `${base}/config`,
        children: [
          { key: "config-company", label: "Company", href: `${base}/config/company` },
          { key: "config-leadership", label: "Leadership", href: `${base}/config/leadership` },
          { key: "config-access", label: "Access", href: `${base}/config/access` },
          { key: "config-operations", label: "Operations", href: `${base}/config/operations` },
          { key: "config-automation", label: "Automation", href: `${base}/config/automation` },
        ],
      },
      {
        key: "assets",
        label: "Assets",
        href: `${base}/assets`,
        children: [
          { key: "assets-scanners", label: "Scanners", href: `${base}/assets/scanners` },
          { key: "assets-fuel-cards", label: "Fuel Cards", href: `${base}/assets/fuel-cards` },
          { key: "assets-audit", label: "Asset Audit", href: `${base}/assets/audit` },
        ],
      },
      { key: "routes", label: "Routes", href: `${base}/routes` },
      { key: "switch-company", label: "Switch Company", href: "/companies" },
    ],
  };
}
