import type { AppMenuSection } from "../appMenu.types";

export function buildPeopleMenu(base: string): AppMenuSection {
  const peopleBase = `${base}/people`;

  return {
    key: "people",
    label: "People",
    items: [
      {
        key: "roster",
        label: "Roster",
        href: `${peopleBase}/roster`,
        match: (pathname) =>
          pathname.startsWith(`${peopleBase}/roster`) ||
          pathname.startsWith(`${peopleBase}/active`) ||
          pathname.startsWith(`${peopleBase}/former`) ||
          pathname.startsWith(`${peopleBase}/import`),
        children: [
          { key: "roster-home", label: "Roster", href: `${peopleBase}/roster` },
          { key: "roster-import", label: "Import", href: `${peopleBase}/import` },
        ],
      },
      {
        key: "hiring",
        label: "Hiring",
        href: `${base}/hiring`,
        match: (pathname) =>
          pathname.startsWith(`${base}/hiring`) ||
          pathname.startsWith(`${peopleBase}/interviews`) ||
          pathname.startsWith(`${peopleBase}/invitations`) ||
          pathname.startsWith(`${peopleBase}/reports`),
        children: [
          { key: "hiring-pipeline", label: "Pipeline", href: `${base}/hiring` },
          { key: "candidate-interviews", label: "Interviews", href: `${peopleBase}/interviews` },
          { key: "candidate-invitations", label: "Invitations", href: `${peopleBase}/invitations` },
          { key: "people-reports", label: "Reports", href: `${peopleBase}/reports` },
        ],
      },
      { key: "corrective-actions", label: "Corrective Actions", href: `${peopleBase}/corrective-actions` },
      {
        key: "hr",
        label: "HR",
        href: `${peopleBase}/policies`,
        match: (pathname) =>
          pathname.startsWith(`${peopleBase}/policies`) ||
          pathname.startsWith(`${peopleBase}/compliance`) ||
          pathname.startsWith(`${peopleBase}/requirements`),
        children: [
          { key: "policies", label: "Policies", href: `${peopleBase}/policies` },
          { key: "compliance", label: "Compliance", href: `${peopleBase}/compliance` },
          { key: "candidate-requirements", label: "Requirements", href: `${peopleBase}/requirements` },
        ],
      },
    ],
  };
}
