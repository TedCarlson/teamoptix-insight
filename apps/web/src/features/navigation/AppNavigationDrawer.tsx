"use client";

import Link from "next/link";
import type { AppMenuSection } from "./appMenu.types";

type Props = {
  open: boolean;
  pathname: string;
  sections: AppMenuSection[];
  onClose: () => void;
};

function itemIsActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AppNavigationDrawer(props: Props) {
  if (!props.open) return null;

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
                const active = item.match ? item.match(props.pathname) : itemIsActive(props.pathname, item.href);

                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    className={`app-drawer__item${active ? " app-drawer__item--active" : ""}`}
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
