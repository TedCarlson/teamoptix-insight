import type { TeamOptixRegistrySection } from "./teamoptix.registry";

export const automationSections: TeamOptixRegistrySection[] = [
  {
    key: "automation",
    eyebrow: "Automation",
    title: "Platform Signals",
    signals: [
      { label: "Ticket Library", value: "Planned", detail: "Reusable Team Optix ticket templates" },
      { label: "Company Assignments", value: "Planned", detail: "Customer-specific ticket bindings and automation parameters" },
      { label: "Collections", value: "Stubbed", detail: "Generated ticket and source freshness view" },
      { label: "Runner Fleet", value: "Stubbed", detail: "Future telemetry workspace" },
      { label: "Telemetry", value: "Stubbed", detail: "Events and failures" },
    ],
  },
];
