import type { TeamOptixRegistrySection } from "./teamoptix.registry";

export const businessSections: TeamOptixRegistrySection[] = [
  {
    key: "business",
    eyebrow: "Business",
    title: "Operating Areas",
    signals: [
      { label: "Contracts", value: "Live", detail: "Document workspace linked" },
      { label: "Legal", value: "Ready", detail: "Entity records workspace" },
      { label: "Sales", value: "Stubbed", detail: "Pipeline and proposals" },
      { label: "Marketing", value: "Stubbed", detail: "Website and positioning" },
      { label: "Finance", value: "Stubbed", detail: "Banking, accounting, and reporting" },
    ],
  },
];
