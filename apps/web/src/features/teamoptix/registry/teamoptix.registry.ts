export type TeamOptixSignal = {
  label: string;
  value: string;
  detail?: string;
};

export type TeamOptixRegistrySection = {
  key: string;
  eyebrow: string;
  title: string;
  signals: TeamOptixSignal[];
};

export const teamOptixCommandCenterSections: TeamOptixRegistrySection[] = [
  {
    key: "client-priorities",
    eyebrow: "Today",
    title: "Client Priorities",
    signals: [
      { label: "Time Keeping", value: "Planning", detail: "Client mention" },
      { label: "Scorecards", value: "Planning", detail: "Client mention" },
      { label: "Fleet Workspace", value: "Discovery", detail: "Expansion" },
    ],
  },
  {
    key: "platform-work",
    eyebrow: "Platform Work",
    title: "Current Build",
    signals: [
      { label: "Workspace Standard", value: "Active", detail: "Foundation pass" },
      { label: "TeamOptix Shell", value: "Scaffolded", detail: "Navigation + routes" },
      { label: "Mobile Shell", value: "Stable", detail: "Drawer-first" },
    ],
  },
  {
    key: "products",
    eyebrow: "Products",
    title: "Portfolio",
    signals: [
      { label: "Insight", value: "Active", detail: "Customer operating platform" },
      { label: "ITG v2.0", value: "Planning", detail: "Separate repo / TeamOptix-managed" },
      { label: "Legal Workspace", value: "Live", detail: "MSA editor available" },
    ],
  },
  {
    key: "engineering",
    eyebrow: "Engineering",
    title: "Health",
    signals: [
      { label: "Lint", value: "Passing" },
      { label: "Typecheck", value: "Passing" },
      { label: "Main", value: "Clean" },
    ],
  },
  {
    key: "decisions",
    eyebrow: "Recent Decisions",
    title: "Locked In",
    signals: [
      { label: "TeamOptix", value: "Umbrella layer", detail: "Above Insight" },
      { label: "Navigation", value: "Drawer-first", detail: "Platform congruent" },
      { label: "Legal", value: "Business workspace", detail: "MSA preserved" },
    ],
  },
];
