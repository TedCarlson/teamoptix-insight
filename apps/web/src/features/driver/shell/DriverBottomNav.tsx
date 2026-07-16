"use client";

import Link from "next/link";
import { BarChart3, CalendarDays, ClipboardCheck, Home, MessageSquareText } from "lucide-react";
import { usePathname } from "next/navigation";

type DriverBottomNavProps = {
  slug: string;
};

const navItems = [
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

  return (
    <nav className="driver-bottom-nav" aria-label="Driver navigation">
      {navItems.map((item) => {
        const href = item.href(slug);
        const active = pathname === href;
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
