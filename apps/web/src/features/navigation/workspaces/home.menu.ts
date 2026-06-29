import type { AppMenuSection } from "../appMenu.types";

export function buildHomeMenu(base: string): AppMenuSection {
  return {
    key: "home",
    label: "Home",
    items: [
      { key: "home", label: "Company Home", href: `${base}/home` },
      { key: "announcements", label: "Announcements", href: `${base}/announcements` },
    ],
  };
}
