"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type DriverBottomNavProps = {
  slug: string;
};

const navItems = [
  {
    key: "home",
    label: "Home",
    icon: "⌂",
    href: (slug: string) => `/company/${slug}/home`,
  },
  {
    key: "schedule",
    label: "Schedule",
    icon: "□",
    href: (slug: string) => `/company/${slug}/driver/schedule`,
  },
];

export function DriverBottomNav({ slug }: DriverBottomNavProps) {
  const pathname = usePathname();

  return (
    <nav className="driver-bottom-nav" aria-label="Driver navigation">
      {navItems.map((item) => {
        const href = item.href(slug);
        const active = pathname === href;

        return (
          <Link
            key={item.key}
            href={href}
            className={`driver-bottom-nav__item ${
              active ? "driver-bottom-nav__item--active" : ""
            }`}
          >
            <span className="driver-bottom-nav__icon" aria-hidden="true">
              {item.icon}
            </span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
