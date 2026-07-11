"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import IdentityPill from "@/features/access/components/IdentityPill";

type NavItem = {
  href: string;
  label: string;
};

const primaryLinks: NavItem[] = [
  { href: "/teamoptix/command-center", label: "Home" },
  { href: "/teamoptix/business", label: "Business" },
  { href: "/teamoptix/products", label: "Products" },
  { href: "/teamoptix/customers", label: "Customers" },
  { href: "/teamoptix/projects", label: "Projects" },
  { href: "/teamoptix/engineering", label: "Engineering" },
  { href: "/teamoptix/automation", label: "Automation" },
  { href: "/teamoptix/ai", label: "AI" },
];

const secondaryLinksByDomain: Record<string, NavItem[]> = {
  business: [
    { href: "/teamoptix/business", label: "Overview" },
    { href: "/teamoptix/business/sales", label: "Sales" },
    { href: "/teamoptix/business/marketing", label: "Marketing" },
    { href: "/teamoptix/business/contracts", label: "Contracts" },
    { href: "/teamoptix/business/legal", label: "Legal" },
    { href: "/teamoptix/business/finance", label: "Finance" },
  ],
  products: [
    { href: "/teamoptix/products", label: "Overview" },
    { href: "/teamoptix/products/insight", label: "Insight" },
    { href: "/teamoptix/products/itg", label: "ITG v2.0" },
  ],
  customers: [
    { href: "/teamoptix/customers", label: "Customer Workspace" },
  ],
  projects: [
    { href: "/teamoptix/projects", label: "Overview" },
    { href: "/teamoptix/projects/roadmap", label: "Roadmap" },
    { href: "/teamoptix/projects/active", label: "Active" },
    { href: "/teamoptix/projects/presentations", label: "Presentations" },
    { href: "/teamoptix/projects/decisions", label: "Decisions" },
  ],
  engineering: [
    { href: "/teamoptix/engineering", label: "Overview" },
    { href: "/teamoptix/engineering/repositories", label: "Repositories" },
    { href: "/teamoptix/engineering/releases", label: "Releases" },
    { href: "/teamoptix/engineering/health", label: "Code Health" },
  ],
  automation: [
    { href: "/teamoptix/automation", label: "Overview" },
    { href: "/teamoptix/automation/runners", label: "Runner Fleet" },
    { href: "/teamoptix/automation/collections", label: "Collections" },
    { href: "/teamoptix/automation/telemetry", label: "Telemetry" },
  ],
  ai: [
    { href: "/teamoptix/ai", label: "Overview" },
    { href: "/teamoptix/ai/prompts", label: "Prompts" },
    { href: "/teamoptix/ai/assistants", label: "Assistants" },
    { href: "/teamoptix/ai/evaluations", label: "Evaluations" },
  ],
};

function activeDomain(pathname: string) {
  return Object.keys(secondaryLinksByDomain).find((domain) =>
    pathname === `/teamoptix/${domain}` || pathname.startsWith(`/teamoptix/${domain}/`)
  );
}

function NavLink(props: { href: string; label: string; pathname: string; className: string }) {
  const active = props.pathname === props.href || props.pathname.startsWith(`${props.href}/`);

  return (
    <Link
      className={`${props.className}${active ? ` ${props.className}--active` : ""}`}
      href={props.href}
      aria-current={active ? "page" : undefined}
    >
      {props.label}
    </Link>
  );
}

export default function TeamOptixShell(props: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const domain = activeDomain(pathname);
  const secondaryLinks = domain ? secondaryLinksByDomain[domain] : [];

  return (
    <div className="teamoptix-shell">
      <header className="teamoptix-header">
        <Link className="brand-mark" href="/teamoptix/command-center">
          <span className="brand-mark__kicker">TeamOptix</span>
          <span className="brand-mark__name">Workspace</span>
        </Link>

        <nav className="teamoptix-rail" aria-label="TeamOptix workspace">
          {primaryLinks.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              pathname={pathname}
              className="teamoptix-rail__link"
            />
          ))}
        </nav>

        <div className="teamoptix-header__right">
          <Link className="button" href="/profile">
            My Workspace
          </Link>
          <IdentityPill />
        </div>
      </header>

      {secondaryLinks.length > 0 ? (
        <nav className="teamoptix-subrail" aria-label={`${domain} navigation`}>
          {secondaryLinks.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              pathname={pathname}
              className="teamoptix-subrail__link"
            />
          ))}
        </nav>
      ) : null}

      {props.children}
    </div>
  );
}
