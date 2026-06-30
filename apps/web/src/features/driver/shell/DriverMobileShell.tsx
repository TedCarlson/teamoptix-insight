"use client";

import { ReactNode } from "react";
import { DriverBottomNav } from "@/features/driver/shell/DriverBottomNav";

type DriverMobileShellProps = {
  slug: string;
  children: ReactNode;
};

export function DriverMobileShell({ slug, children }: DriverMobileShellProps) {
  return (
    <main className="driver-mobile-shell">
      <section className="driver-mobile-content">{children}</section>
      <DriverBottomNav slug={slug} />
    </main>
  );
}
