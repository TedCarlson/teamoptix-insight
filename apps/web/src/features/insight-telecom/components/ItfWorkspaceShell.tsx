"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import IdentityPill from "@/features/access/components/IdentityPill";
import CompanySwitcher from "@/features/teamoptix/navigation/CompanySwitcher";
import ThemeToggle from "@/features/theme/ThemeToggle";
import type { ItfWorkspaceContext } from "../access/itfWorkspaceContext";
import styles from "./ItfWorkspaceShell.module.css";

type ItfWorkspaceShellProps = {
  children: React.ReactNode;
  context: ItfWorkspaceContext;
};

const surfaces = [
  { segment: "", label: "Home" },
  { segment: "roster", label: "Roster" },
  { segment: "operations", label: "Operations" },
  { segment: "metrics", label: "Metrics" },
  { segment: "reports", label: "Reports" },
  { segment: "tools", label: "Tools" },
] as const;

export default function ItfWorkspaceShell({
  children,
  context,
}: ItfWorkspaceShellProps) {
  const pathname = usePathname() ?? "";
  const base = `/insight/telecom-fulfillment/${context.company_slug}`;

  return (
    <div className={styles.workspace}>
      <header className={styles.header}>
        <div className={styles.topbar}>
          <div className={styles.productIdentity}>
            <Link className={styles.platformLink} href="/teamoptix/command-center">
              TeamOptix
            </Link>
            <span className={styles.divider} aria-hidden="true" />
            <Link className={styles.productLink} href={base}>
              <strong>Insight</strong>
              <span>Telecom Fulfillment</span>
            </Link>
          </div>

          <div className={styles.companyContext}>
            <span>Company</span>
            <strong>{context.company_name}</strong>
          </div>

          <div className={styles.actions}>
            <CompanySwitcher />
            <ThemeToggle />
            <Link className="button" href="/profile">
              Profile
            </Link>
            <IdentityPill />
          </div>
        </div>

        <nav className={styles.navigation} aria-label="Telecom Fulfillment">
          <div className={styles.navigationInner}>
            {surfaces.map((surface) => {
              const href = surface.segment ? `${base}/${surface.segment}` : base;
              const active = surface.segment
                ? pathname === href || pathname.startsWith(`${href}/`)
                : pathname === base;

              return (
                <Link
                  className={`${styles.navigationLink}${active ? ` ${styles.navigationLinkActive}` : ""}`}
                  href={href}
                  key={surface.label}
                  aria-current={active ? "page" : undefined}
                >
                  {surface.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </header>

      <div className={styles.stage}>{children}</div>
    </div>
  );
}
