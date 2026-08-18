import type { TeamOptixRegistrySection } from "./teamoptix.registry";

export const projectSections: TeamOptixRegistrySection[] = [
  {
    key: "projects-active",
    eyebrow: "Projects",
    title: "Active Portfolio",
    signals: [
      { label: "Insight — P&D Last Mile", value: "In service", detail: "Workspace standard" },
      { label: "Insight — Telecom Fulfillment", value: "In review", detail: "Interface consolidation" },
      { label: "Utility Locate Service", value: "Planned", detail: "Independent product foundation" },
      { label: "Presentations", value: "Open", detail: "Sales and leadership materials" },
    ],
  },
];
