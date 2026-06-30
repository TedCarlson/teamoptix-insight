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

function itemIsActive(pathname: string, href: string) {
  return pathname === href;
}

function itemIsInBranch(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function itemOrChildIsActive(pathname: string, item: AppMenuItem) {
  return itemIsInBranch(pathname, item.href) || Boolean(item.children?.some((child) => itemIsInBranch(pathname, child.href)));
}

function activeSectionKey(pathname: string, sections: AppMenuSection[]) {
  for (const section of sections) {
    for (const item of section.items) {
      const itemActive = item.match ? item.match(pathname) : itemOrChildIsActive(pathname, item);

      if (itemActive) {
        return section.key;
      }
    }
  }

  return sections[0]?.key ?? null;
}

function activeExpandableKey(pathname: string, sections: AppMenuSection[]) {
  for (const section of sections) {
    for (const item of section.items) {
      if (item.children?.length && itemOrChildIsActive(pathname, item)) {
        return item.key;
      }
    }
  }

  return null;
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
                  <span>{section.label}</span>
                  <span aria-hidden="true">{sectionExpanded ? "−" : "+"}</span>
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
                        <span>{item.label}</span>
                        <span aria-hidden="true">{expanded ? "−" : "+"}</span>
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
                    {item.label}
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
