import type { TeamOptixRegistrySection } from "./teamoptix.registry";

export const customerSections: TeamOptixRegistrySection[] = [
  {
    key: "customers",
    eyebrow: "Customers",
    title: "Attention",
    signals: [
      { label: "Beacon Point", value: "Active", detail: "Client priorities captured" },
      { label: "Freedom", value: "Watching", detail: "Future expansion candidate" },
      { label: "Keystone", value: "Watching", detail: "Future expansion candidate" },
    ],
  },
];
