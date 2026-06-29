import type { TeamOptixRegistrySection } from "./teamoptix.registry";

export const businessSections: TeamOptixRegistrySection[] = [
  {
    key: "business",
    eyebrow: "Business",
    title: "Operating Areas",
    signals: [
      { label: "Legal", value: "Live", detail: "MSA editor linked" },
      { label: "Sales", value: "Stubbed", detail: "Pipeline and proposals" },
      { label: "Marketing", value: "Stubbed", detail: "Website and positioning" },
    ],
  },
];
