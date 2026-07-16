import type { AppMenuSection } from "../appMenu.types";

export function buildFleetMenu(base: string): AppMenuSection {
  return {
    key: "fleet",
    label: "Fleet",
    items: [
      { key: "fleet-home", label: "Fleet Home", href: `${base}/fleet` },
      { key: "fleet-vehicles", label: "Vehicles", href: `${base}/fleet/vehicles` },
      { key: "fleet-maintenance", label: "Maintenance", href: `${base}/fleet/maintenance` },
      { key: "fleet-inspections", label: "Inspections", href: `${base}/fleet/inspections` },
    ],
  };
}
