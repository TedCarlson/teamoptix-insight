import type { TeamOptixRegistrySection } from "./teamoptix.registry";

export const commandCenterSections: TeamOptixRegistrySection[] = [
  {
    key: "current-focus",
    eyebrow: "Current Focus",
    title: "Active Work",
    signals: [
      { label: "Workspace Standard", value: "Active", detail: "Platform-wide foundation pass" },
      { label: "Time Keeping", value: "Next", detail: "Client priority" },
      { label: "Scorecards", value: "Next", detail: "Client priority" },
    ],
  },
  {
    key: "client-priorities",
    eyebrow: "Client Priorities",
    title: "Mentioned Items",
    signals: [
      { label: "Time Keeping", value: "Planning", detail: "Beacon Point request" },
      { label: "Scorecards", value: "Planning", detail: "Beacon Point request" },
      { label: "Fleet Workspace", value: "Discovery", detail: "Expansion opportunity" },
    ],
  },
  {
    key: "architecture",
    eyebrow: "Architecture",
    title: "Locked In",
    signals: [
      { label: "TeamOptix", value: "Umbrella", detail: "Runs the business above Insight" },
      { label: "Insight", value: "Product", detail: "Customer operating platform" },
      { label: "Navigation", value: "Rail-first", detail: "Drawer remains secondary for compact navigation" },
      { label: "Legal", value: "Business", detail: "MSA workspace preserved" },
    ],
  },
];
