import type { TeamOptixRegistrySection } from "./teamoptix.registry";

export const engineeringSections: TeamOptixRegistrySection[] = [
  {
    key: "engineering-health",
    eyebrow: "Engineering",
    title: "Health",
    signals: [
      { label: "Lint", value: "Passing" },
      { label: "Typecheck", value: "Passing" },
      { label: "Main", value: "Clean" },
    ],
  },
];
