import type { AppMenuSection } from "../appMenu.types";

export function buildPeopleMenu(base: string): AppMenuSection {
  return {
    key: "people",
    label: "People",
    items: [
      { key: "roster", label: "Roster", href: `${base}/people` },
      { key: "hiring", label: "Hiring", href: `${base}/hiring` },
      { key: "candidate-invitations", label: "Invitations", href: `${base}/people/invitations` },
      { key: "candidate-interviews", label: "Interviews", href: `${base}/people/interviews` },
      { key: "candidate-requirements", label: "Requirements", href: `${base}/people/requirements` },
      { key: "compliance", label: "Compliance", href: `${base}/people/compliance` },
      { key: "policies", label: "Policies", href: `${base}/people/policies` },
      { key: "corrective-actions", label: "Corrective Actions", href: `${base}/people/corrective-actions` },
      { key: "people-reports", label: "Reports", href: `${base}/people/reports` },
    ],
  };
}
