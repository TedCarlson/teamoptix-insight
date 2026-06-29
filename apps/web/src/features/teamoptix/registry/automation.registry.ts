import type { TeamOptixRegistrySection } from "./teamoptix.registry";

export const automationSections: TeamOptixRegistrySection[] = [
  {
    key: "automation",
    eyebrow: "Automation",
    title: "Platform Signals",
    signals: [
      { label: "Runner Fleet", value: "Stubbed", detail: "Future telemetry workspace" },
      { label: "Collections", value: "Stubbed", detail: "Freshness and source health" },
      { label: "Telemetry", value: "Stubbed", detail: "Events and failures" },
    ],
  },
];
