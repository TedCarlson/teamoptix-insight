import type { AppMenuSection } from "../appMenu.types";

export function buildOperationsMenu(base: string): AppMenuSection {
  return {
    key: "operations",
    label: "Operations",
    items: [
      { key: "dispatch", label: "Dispatch", href: `${base}/operations/dispatch` },
      { key: "delivery-window", label: "Delivery Window", href: `${base}/operations/delivery-window` },
      { key: "operations-intelligence", label: "Planning", href: `${base}/operations/intelligence` },
      { key: "ops-reports", label: "Ops Reports", href: `${base}/prior-day` },
    ],
  };
}
