"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import IdentityPill from "@/features/access/components/IdentityPill";
import AppNavigationDrawer from "@/features/navigation/AppNavigationDrawer";
import { buildTeamOptixMenu } from "./teamoptixMenu.model";

export default function TeamOptixShell(props: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const [drawerOpen, setDrawerOpen] = useState(false);
  const menuSections = buildTeamOptixMenu();

  return (
    <div className="teamoptix-shell">
      <header className="teamoptix-header">
        <button
          type="button"
          className="app-menu-button"
          aria-label="Open TeamOptix navigation"
          onClick={() => setDrawerOpen(true)}
        >
          ☰
        </button>

        <Link className="brand-mark" href="/teamoptix">
          <span className="brand-mark__kicker">TeamOptix</span>
          <span className="brand-mark__name">Command Center</span>
        </Link>

        <IdentityPill />
      </header>

      <AppNavigationDrawer
        open={drawerOpen}
        pathname={pathname}
        sections={menuSections}
        onClose={() => setDrawerOpen(false)}
      />

      {props.children}
    </div>
  );
}
