import type { TeamOptixRegistrySection } from "./teamoptix.registry";

export const projectSections: TeamOptixRegistrySection[] = [
  {
    key: "projects-active",
    eyebrow: "Projects",
    title: "Active Portfolio",
    signals: [
      { label: "Insight", value: "Active", detail: "Workspace Standard" },
      { label: "ITG v2.0", value: "Planning", detail: "Bring into TeamOptix" },
      { label: "Presentations", value: "Open", detail: "Sales and leadership materials" },
    ],
  },
];
