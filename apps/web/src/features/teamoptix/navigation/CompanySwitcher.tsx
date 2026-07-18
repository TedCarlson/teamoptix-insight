"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Company = {
  id: string;
  company_name: string | null;
  company_slug: string;
  company_status: string;
  lifecycle_status: string;
  blocker_count: number;
};

function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function CompanySwitcher() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const openSwitcher = useCallback(async () => {
    setOpen(true);
    if (companies.length || loading) return;
    setLoading(true);
    try {
      const response = await fetch("/api/teamoptix/companies", { cache: "no-store" });
      const payload = await response.json();
      setCompanies(Array.isArray(payload.companies) ? payload.companies : []);
    } finally {
      setLoading(false);
    }
  }, [companies.length, loading]);

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        void openSwitcher();
      }
    };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, [openSwitcher]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => searchRef.current?.focus());
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return companies;
    return companies.filter((company) =>
      `${company.company_name ?? ""} ${company.company_slug}`.toLowerCase().includes(needle)
    );
  }, [companies, query]);

  return (
    <>
      <button className="button company-switcher-trigger" type="button" onClick={openSwitcher}>
        Companies
        <span aria-hidden="true">⌘K</span>
      </button>

      {open ? (
        <div className="company-switcher-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}>
          <section className="company-switcher" role="dialog" aria-modal="true" aria-labelledby="company-switcher-title">
            <header className="company-switcher__header">
              <div>
                <p className="value-card__eyebrow">Insight workspaces</p>
                <h2 id="company-switcher-title">Open a company</h2>
              </div>
              <button className="company-switcher__close" type="button" onClick={() => setOpen(false)} aria-label="Close company switcher">×</button>
            </header>

            <label className="company-switcher__search">
              <span aria-hidden="true">⌕</span>
              <input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search governed companies" />
              <kbd>Esc</kbd>
            </label>

            <div className="company-switcher__list">
              {loading ? <p className="company-switcher__empty">Loading companies…</p> : null}
              {!loading && filtered.length === 0 ? <p className="company-switcher__empty">No governed Insight companies match this search.</p> : null}
              {filtered.map((company) => (
                <Link className="company-switcher__row" href={`/company/${company.company_slug}`} key={company.id} onClick={() => setOpen(false)}>
                  <span className="company-switcher__monogram">{(company.company_name ?? company.company_slug).slice(0, 2).toUpperCase()}</span>
                  <span className="company-switcher__identity">
                    <strong>{company.company_name ?? company.company_slug}</strong>
                    <small>{titleCase(company.lifecycle_status)}</small>
                  </span>
                  <span className={`company-switcher__status${company.blocker_count ? " company-switcher__status--attention" : ""}`}>
                    {company.blocker_count ? `${company.blocker_count} blocker${company.blocker_count === 1 ? "" : "s"}` : "Open"}
                  </span>
                  <span aria-hidden="true">→</span>
                </Link>
              ))}
            </div>

            <footer className="company-switcher__footer">
              <span>Only governed Insight companies are shown.</span>
              <Link href="/teamoptix/customers" onClick={() => setOpen(false)}>Manage customers →</Link>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}
