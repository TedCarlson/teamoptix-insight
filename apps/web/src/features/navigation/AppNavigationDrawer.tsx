"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { AppMenuItem, AppMenuSection } from "./appMenu.types";

type Props = {
  open: boolean;
  pathname: string;
  sections: AppMenuSection[];
  onClose: () => void;
};

type IconName =
  | "ai"
  | "automation"
  | "briefcase"
  | "building"
  | "calendar"
  | "chart"
  | "check"
  | "file"
  | "folder"
  | "gear"
  | "home"
  | "megaphone"
  | "package"
  | "receipt"
  | "route"
  | "shield"
  | "sliders"
  | "timer"
  | "truck"
  | "user-plus"
  | "users"
  | "wrench";

function itemIsActive(pathname: string, href: string) {
  return pathname === href;
}

function itemIsInBranch(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function itemOrChildIsActive(pathname: string, item: AppMenuItem) {
  const itemActive = item.match
    ? item.match(pathname)
    : itemIsInBranch(pathname, item.href);
  const childActive = item.children?.some((child) =>
    child.match ? child.match(pathname) : itemIsInBranch(pathname, child.href)
  );

  return itemActive || Boolean(childActive);
}

function activeSectionKey(pathname: string, sections: AppMenuSection[]) {
  for (const section of sections) {
    for (const item of section.items) {
      const itemActive = item.match ? item.match(pathname) : itemOrChildIsActive(pathname, item);

      if (itemActive) return section.key;
    }
  }

  return sections[0]?.key ?? null;
}

function activeExpandableKey(pathname: string, sections: AppMenuSection[]) {
  for (const section of sections) {
    for (const item of section.items) {
      if (item.children?.length && itemOrChildIsActive(pathname, item)) return item.key;
    }
  }

  return null;
}

function iconForLabel(label: string): IconName {
  const value = label.toLowerCase();

  if (value.includes("home")) return "home";
  if (value.includes("announcement")) return "megaphone";
  if (value.includes("admin") || value.includes("access")) return "shield";
  if (value.includes("company") || value.includes("profile")) return "building";
  if (value.includes("payroll")) return "receipt";
  if (value.includes("analytics")) return "chart";
  if (value.includes("config")) return "sliders";
  if (value.includes("asset")) return "package";
  if (value.includes("route")) return "route";
  if (value.includes("dispatch") || value.includes("operations")) return "truck";
  if (value.includes("delivery")) return "timer";
  if (value.includes("planning") || value.includes("schedule") || value.includes("calendar")) return "calendar";
  if (value.includes("workbench")) return "wrench";
  if (value.includes("compliance")) return "check";
  if (value.includes("hiring")) return "user-plus";
  if (value.includes("people") || value.includes("roster") || value.includes("customer")) return "users";
  if (value.includes("project")) return "folder";
  if (value.includes("product")) return "package";
  if (value.includes("engineering") || value.includes("platform")) return "gear";
  if (value.includes("automation")) return "automation";
  if (value.includes("business") || value.includes("commercial") || value.includes("legal")) return "briefcase";
  if (value.includes("ai")) return "ai";
  if (value.includes("report") || value.includes("ops report")) return "file";

  return "file";
}

function NavIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    ai: <path d="M12 3l1.4 4.1L17.5 8.5l-4.1 1.4L12 14l-1.4-4.1L6.5 8.5l4.1-1.4L12 3Zm-5 9l.8 2.2L10 15l-2.2.8L7 18l-.8-2.2L4 15l2.2-.8L7 12Zm10 2l.8 2.2L20 17l-2.2.8L17 20l-.8-2.2L14 17l2.2-.8L17 14Z" />,
    automation: <><rect x="5" y="8" width="14" height="10" rx="3" /><path d="M12 8V5" /><path d="M9 12h.01" /><path d="M15 12h.01" /><path d="M9 16h6" /></>,
    briefcase: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M3 12h18" /></>,
    building: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M9 21v-4h6v4" /><path d="M8 7h.01M12 7h.01M16 7h.01M8 11h.01M12 11h.01M16 11h.01" /></>,
    calendar: <><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M16 3v4M8 3v4M4 10h16" /></>,
    chart: <><path d="M4 19V5" /><path d="M4 19h16" /><path d="M8 16v-5M12 16V8M16 16v-8" /></>,
    check: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-5" /></>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6" /><path d="M8 13h8M8 17h5" /></>,
    folder: <><path d="M3 6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /></>,
    gear: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.8 1.8 0 0 0 .4 2l.1.1-2 3.4-.2-.1a1.8 1.8 0 0 0-2.1.2 1.8 1.8 0 0 0-.8 1.8V22h-4v-.2a1.8 1.8 0 0 0-.8-1.8 1.8 1.8 0 0 0-2.1-.2l-.2.1-2-3.4.1-.1a1.8 1.8 0 0 0 .4-2 1.8 1.8 0 0 0-1.6-1.2H4v-4h.2A1.8 1.8 0 0 0 5.8 8 1.8 1.8 0 0 0 5.4 6l-.1-.1 2-3.4.2.1a1.8 1.8 0 0 0 2.1-.2 1.8 1.8 0 0 0 .8-1.8V2h4v.2a1.8 1.8 0 0 0 .8 1.8 1.8 1.8 0 0 0 2.1.2l.2-.1 2 3.4-.1.1a1.8 1.8 0 0 0-.4 2 1.8 1.8 0 0 0 1.6 1.2h.2v4h-.2A1.8 1.8 0 0 0 19.4 15Z" /></>,
    home: <><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10" /><path d="M9 20v-6h6v6" /></>,
    megaphone: <><path d="M3 11v2a2 2 0 0 0 2 2h3l7 4V5l-7 4H5a2 2 0 0 0-2 2Z" /><path d="M18 9a4 4 0 0 1 0 6" /></>,
    package: <><path d="m21 8-9-5-9 5 9 5 9-5Z" /><path d="M3 8v8l9 5 9-5V8" /><path d="M12 13v8" /></>,
    receipt: <><path d="M6 2h12v20l-3-2-3 2-3-2-3 2Z" /><path d="M9 7h6M9 11h6M9 15h3" /></>,
    route: <><circle cx="6" cy="19" r="3" /><circle cx="18" cy="5" r="3" /><path d="M9 19h4a5 5 0 0 0 0-10h-2a5 5 0 0 1 0-10h1" /></>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /></>,
    sliders: <><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" /><path d="M2 14h4M10 8h4M18 16h4" /></>,
    timer: <><circle cx="12" cy="13" r="8" /><path d="M12 13V9M9 2h6" /></>,
    truck: <><path d="M3 7h11v10H3z" /><path d="M14 11h4l3 3v3h-7z" /><circle cx="7" cy="19" r="2" /><circle cx="17" cy="19" r="2" /></>,
    "user-plus": <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6M22 11h-6" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.9" /><path d="M16 3.1a4 4 0 0 1 0 7.8" /></>,
    wrench: <><path d="M14.7 6.3a4 4 0 0 0-5 5L3 18l3 3 6.7-6.7a4 4 0 0 0 5-5l-2.4 2.4-3-3 2.4-2.4Z" /></>,
  };

  return (
    <svg className="app-drawer__icon" viewBox="0 0 24 24" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

export default function AppNavigationDrawer(props: Props) {
  const activeKey = useMemo(
    () => activeExpandableKey(props.pathname, props.sections),
    [props.pathname, props.sections]
  );
  const activeDrawerSectionKey = useMemo(
    () => activeSectionKey(props.pathname, props.sections),
    [props.pathname, props.sections]
  );
  const [expandedKey, setExpandedKey] = useState<string | null>(activeKey);
  const [expandedSectionKey, setExpandedSectionKey] = useState<string | null>(activeDrawerSectionKey);

  if (!props.open) return null;

  function toggleKey(key: string) {
    setExpandedKey((current) => (current === key ? null : key));
  }

  return (
    <div className="app-drawer-backdrop" role="presentation" onClick={props.onClose}>
      <aside
        className="app-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="app-drawer__header">
          <div>
            <p className="brand-mark__kicker">TeamOptix</p>
            <strong className="brand-mark__name">Insight</strong>
          </div>

          <button type="button" className="app-drawer__close" onClick={props.onClose}>
            Close
          </button>
        </div>

        <div className="app-drawer__sections">
          {props.sections.map((section) => {
            const sectionExpanded = (expandedSectionKey ?? activeDrawerSectionKey) === section.key;

            return (
              <section key={section.key} className="app-drawer__section">
                <button
                  type="button"
                  className="app-drawer__section-toggle"
                  aria-expanded={sectionExpanded}
                  onClick={() => setExpandedSectionKey((current) => (current === section.key ? null : section.key))}
                >
                  <span className="app-drawer__section-title">
                    <NavIcon name={iconForLabel(section.label)} />
                    <span>{section.label}</span>
                  </span>
                  <span className="app-drawer__chevron" aria-hidden="true">
                    {sectionExpanded ? "⌄" : "›"}
                  </span>
                </button>

                {sectionExpanded ? section.items.map((item) => {
                const hasChildren = Boolean(item.children?.length);
                const current = item.match ? item.match(props.pathname) : itemIsActive(props.pathname, item.href);
                const branchActive = itemOrChildIsActive(props.pathname, item);
                const expanded = (expandedKey ?? activeKey) === item.key;

                if (hasChildren) {
                  return (
                    <div key={item.key} className="app-drawer__item-group">
                      <button
                        type="button"
                        className={`app-drawer__item app-drawer__item-button${current ? " app-drawer__item--active" : ""}`}
                        aria-expanded={expanded}
                        onClick={() => toggleKey(item.key)}
                      >
                        <span className="app-drawer__item-label">
                          <NavIcon name={iconForLabel(item.label)} />
                          <span>{item.label}</span>
                        </span>
                        <span className="app-drawer__chevron" aria-hidden="true">
                          {expanded ? "⌄" : "›"}
                        </span>
                      </button>

                      {expanded ? (
                        <div className="app-drawer__children">
                          {item.children?.map((child) => {
                            const childActive = child.match
                              ? child.match(props.pathname)
                              : itemIsInBranch(props.pathname, child.href);

                            return (
                              <Link
                                key={child.key}
                                href={child.href}
                                className={`app-drawer__child${childActive ? " app-drawer__child--active" : ""}`}
                                onClick={props.onClose}
                              >
                                {child.label}
                              </Link>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  );
                }

                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    className={`app-drawer__item${current ? " app-drawer__item--active" : ""}`}
                    onClick={props.onClose}
                  >
                    <span className="app-drawer__item-label">
                      <NavIcon name={iconForLabel(item.label)} />
                      <span>{item.label}</span>
                    </span>
                  </Link>
                );
              }) : null}
            </section>
            );
          })}
        </div>
      </aside>
    </div>
  );
}
