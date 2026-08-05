import type { AppMenuSection } from "../appMenu.types";

export function buildOperationsMenu(base: string): AppMenuSection {
  return {
    key: "operations",
    label: "Operations",
    items: [
      { key: "operations-home", label: "Operations", href: `${base}/operations` },
      { key: "dispatch", label: "Dispatch", href: `${base}/operations/dispatch` },
      { key: "service", label: "Service", href: `${base}/operations/service` },
      { key: "planning", label: "Planning", href: `${base}/operations/planning` },
      { key: "ops-reports", label: "Ops Reports", href: `${base}/prior-day` },
      { key: "pickup-reconciliation", label: "PU Reconciliation", href: `${base}/operations/pickup-reconciliation` },
    ],
  };
}
