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

function activeExpandableKeys(pathname: string, sections: AppMenuSection[]) {
  const keys: string[] = [];

  for (const section of sections) {
    for (const item of section.items) {
      if (item.children?.length && itemOrChildIsActive(pathname, item)) {
        keys.push(item.key);
      }
    }
  }

  return keys;
}

export default function AppNavigationDrawer(props: Props) {
  const activeKeys = useMemo(
    () => activeExpandableKeys(props.pathname, props.sections),
    [props.pathname, props.sections]
  );
  const [expandedKeys, setExpandedKeys] = useState<string[]>(activeKeys);

  if (!props.open) return null;

  function toggleKey(key: string) {
    setExpandedKeys((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key]
    );
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
          {props.sections.map((section) => (
            <section key={section.key} className="app-drawer__section">
              <p className="app-drawer__section-label">{section.label}</p>

              {section.items.map((item) => {
                const hasChildren = Boolean(item.children?.length);
                const current = item.match ? item.match(props.pathname) : itemIsActive(props.pathname, item.href);
                const branchActive = itemOrChildIsActive(props.pathname, item);
                const expanded = expandedKeys.includes(item.key) || branchActive;

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
              })}
            </section>
          ))}
        </div>
      </aside>
    </div>
  );
}
