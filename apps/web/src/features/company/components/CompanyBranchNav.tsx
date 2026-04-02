"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type CompanyBranchNavProps = {
  slug: string;
};

type NavItem = {
  label: string;
  href: string;
  match: (pathname: string) => boolean;
};

function mainNavItemStyle(active: boolean): React.CSSProperties {
  return {
    minHeight: 38,
    padding: "0 12px",
    borderRadius: 10,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    textDecoration: "none",
    fontSize: 14,
    fontWeight: 700,
    lineHeight: 1,
    border: active ? "1px solid #0f172a" : "1px solid #d6dfeb",
    background: active ? "#0f172a" : "#fff",
    color: active ? "#fff" : "#0f172a",
    whiteSpace: "nowrap",
  };
}

function subNavItemStyle(active: boolean): React.CSSProperties {
  return {
    minHeight: 34,
    padding: "0 12px",
    borderRadius: 999,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    textDecoration: "none",
    fontSize: 13,
    fontWeight: 700,
    lineHeight: 1,
    border: active ? "1px solid #0f172a" : "1px solid #d6dfeb",
    background: active ? "#e2e8f0" : "#fff",
    color: "#0f172a",
    whiteSpace: "nowrap",
  };
}

export default function CompanyBranchNav(props: CompanyBranchNavProps) {
  const { slug } = props;
  const pathname = usePathname() ?? "";

  const base = `/company/${slug}`;
  const scheduleBase = `${base}/schedule`;

  const mainItems: NavItem[] = [
    {
      label: "Overview",
      href: base,
      match: (path) => path === base,
    },
    {
      label: "People",
      href: `${base}/people`,
      match: (path) => path.startsWith(`${base}/people`),
    },
    {
      label: "Hiring",
      href: `${base}/hiring`,
      match: (path) => path.startsWith(`${base}/hiring`),
    },
    {
      label: "Schedule",
      href: `${base}/schedule`,
      match: (path) => path.startsWith(`${base}/schedule`),
    },
    {
      label: "Routes",
      href: `${base}/routes`,
      match: (path) => path.startsWith(`${base}/routes`),
    },
  ];

  const inScheduleBranch =
    pathname === scheduleBase || pathname.startsWith(`${scheduleBase}/`);

  const scheduleSubItems: NavItem[] = [
    {
      label: "Calendar",
      href: `${base}/schedule`,
      match: (path) => path === `${base}/schedule`,
    },
    {
      label: "Workbench",
      href: `${base}/schedule/generated`,
      match: (path) => path === `${base}/schedule/generated`,
    },
    {
      label: "Overrides",
      href: `${base}/schedule/overrides`,
      match: (path) => path.startsWith(`${base}/schedule/overrides`),
    },
    {
      label: "Presets",
      href: `${base}/schedule/presets`,
      match: (path) => path.startsWith(`${base}/schedule/presets`),
    },
  ];

  return (
    <div
      style={{
        width: "100%",
        borderBottom: "1px solid #e6edf5",
        background: "#fff",
      }}
    >
      <div
        style={{
          width: "min(1440px, calc(100% - 24px))",
          margin: "0 auto",
          padding: "10px 0 8px",
          display: "grid",
          gap: 8,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <Link href="/companies" className="button">
              Companies
            </Link>

            {mainItems.map((item) => {
              const active = item.match(pathname);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  style={mainNavItemStyle(active)}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>

          <button
            type="button"
            className="button"
            aria-label="Open company navigation"
            title="Foundation for company branch menu"
          >
            ☰
          </button>
        </div>

        {inScheduleBranch ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
              paddingLeft: 2,
            }}
          >
            {scheduleSubItems.map((item) => {
              const active = item.match(pathname);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  style={subNavItemStyle(active)}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}