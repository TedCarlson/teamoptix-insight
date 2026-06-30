"use client";

import { ReactNode } from "react";
import { useAccess } from "@/features/access/AccessProvider";
import { DriverBottomNav } from "@/features/driver/shell/DriverBottomNav";

type DriverMobileShellProps = {
  slug: string;
  children: ReactNode;
};

function initialsFromName(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) return "D";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export function DriverMobileShell({ slug, children }: DriverMobileShellProps) {
  const access = useAccess();
  const displayName = access.display_name || access.first_name || access.email || "Driver";
  const initials = initialsFromName(displayName);

  return (
    <main className="driver-mobile-shell">
      <header className="driver-mobile-topbar">
        <div className="driver-mobile-brand">
          <span>TEAMOPTIX</span>
          <strong>Insight</strong>
        </div>

        <div className="driver-mobile-identity" aria-label={displayName}>
          {initials}
        </div>
      </header>

      <section className="driver-mobile-content">{children}</section>

      <DriverBottomNav slug={slug} />
    </main>
  );
}
