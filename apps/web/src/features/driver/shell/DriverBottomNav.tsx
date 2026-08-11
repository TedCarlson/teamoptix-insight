"use client";

import Link from "next/link";
import { BarChart3, CalendarDays, ClipboardCheck, Grid2X2, Home, MessageSquareText } from "lucide-react";
import { usePathname } from "next/navigation";
import { useAccess } from "@/features/access/AccessProvider";
import { hasMobileWorkspaceAccess } from "@/features/mobile-workspace/mobileWorkspace";

type DriverBottomNavProps = {
  slug: string;
};

const driverNavItems = [
  {
    key: "home",
    label: "Home",
    Icon: Home,
    href: (slug: string) => `/company/${slug}/home`,
  },
  {
    key: "messages",
    label: "Messages",
    Icon: MessageSquareText,
    href: (slug: string) => `/company/${slug}/driver/messages`,
  },
  {
    key: "schedule",
    label: "Schedule",
    Icon: CalendarDays,
    href: (slug: string) => `/company/${slug}/driver/schedule`,
  },
  {
    key: "inspect",
    label: "Inspect",
    Icon: ClipboardCheck,
    href: (slug: string) => `/company/${slug}/driver/vehicle-inspection`,
  },
  {
    key: "scorecard",
    label: "Scorecard",
    Icon: BarChart3,
    href: (slug: string) => `/company/${slug}/driver/scorecard`,
  },
];

export function DriverBottomNav({ slug }: DriverBottomNavProps) {
  const pathname = usePathname();
  const access = useAccess();
  const hasWorkspaceTools = hasMobileWorkspaceAccess(access, slug);
  const navItems = hasWorkspaceTools
    ? [
        driverNavItems[0],
        driverNavItems[1],
        {
          ...driverNavItems[2],
          href: (companySlug: string) => `/company/${companySlug}/mobile/schedule`,
        },
        driverNavItems[3],
        {
          key: "tools",
          label: "Tools",
          Icon: Grid2X2,
          href: (companySlug: string) => `/company/${companySlug}/mobile`,
        },
      ]
    : driverNavItems;

  return (
    <nav className="driver-bottom-nav" aria-label="Driver navigation">
      {navItems.map((item) => {
        const href = item.href(slug);
        const active = item.key === "tools"
          ? pathname === href
          : item.key === "schedule" && hasWorkspaceTools
            ? pathname === href || pathname?.startsWith(`/company/${slug}/schedule`)
            : pathname === href;
        const Icon = item.Icon;

        return (
          <Link
            key={item.key}
            href={href}
            className={`driver-bottom-nav__item ${
              active ? "driver-bottom-nav__item--active" : ""
            }`}
          >
            <Icon className="driver-bottom-nav__icon" aria-hidden="true" size={20} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
