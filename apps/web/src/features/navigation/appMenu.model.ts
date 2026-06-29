import type { AppMenuSection } from "./appMenu.types";
import { buildAdministrationMenu } from "./workspaces/administration.menu";
import { buildHomeMenu } from "./workspaces/home.menu";
import { buildOperationsMenu } from "./workspaces/operations.menu";
import { buildPeopleMenu } from "./workspaces/people.menu";
import { buildScheduleMenu } from "./workspaces/schedule.menu";

export function buildCompanyMenu(params: {
  slug: string;
  isAdminUser: boolean;
}): AppMenuSection[] {
  const { slug, isAdminUser } = params;
  const base = `/company/${slug}`;

  if (!isAdminUser) {
    return [
      {
        key: "my-work",
        label: "My Work",
        items: [
          { key: "home", label: "Home", href: `${base}/home` },
          { key: "schedule", label: "My Schedule", href: `${base}/schedule` },
          { key: "announcements", label: "Announcements", href: `${base}/announcements` },
        ],
      },
      {
        key: "account",
        label: "Account",
        items: [{ key: "switch-company", label: "Switch Company", href: "/companies" }],
      },
    ];
  }

  return [
    buildHomeMenu(base),
    buildAdministrationMenu(base),
    buildOperationsMenu(base),
    buildScheduleMenu(base),
    buildPeopleMenu(base),
  ];
}
