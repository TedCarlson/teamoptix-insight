import type { AppMenuSection } from "../appMenu.types";

export function buildScheduleMenu(base: string): AppMenuSection {
  return {
    key: "schedule",
    label: "Schedule",
    items: [
      { key: "calendar", label: "Calendar", href: `${base}/schedule` },
      { key: "workbench", label: "Workbench", href: `${base}/schedule/generated` },
      { key: "overrides", label: "Overrides", href: `${base}/schedule/overrides` },
      { key: "presets", label: "Presets", href: `${base}/schedule/presets` },
    ],
  };
}
