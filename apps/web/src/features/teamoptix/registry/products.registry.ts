import type { TeamOptixRegistrySection } from "./teamoptix.registry";

export const productSections: TeamOptixRegistrySection[] = [
  {
    key: "products",
    eyebrow: "Products",
    title: "Portfolio State",
    signals: [
      { label: "Insight", value: "Active", detail: "Customer operating platform" },
      { label: "ITG v2.0", value: "Planning", detail: "Separate repo / TeamOptix-managed" },
      { label: "Legal Workspace", value: "Live", detail: "MSA editor available" },
    ],
  },
];
