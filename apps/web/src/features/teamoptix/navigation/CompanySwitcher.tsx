"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  companyProductHref,
  productKeyFromPathname,
  type InsightProductKey,
} from "./productWorkspace";

type Product = {
  product_key: InsightProductKey;
  product_name: string;
  product_short_name: string;
  product_status: string;
  company_count: number;
};

type Company = {
  id: string;
  company_name: string;
  legal_name: string | null;
  company_slug: string;
  company_status: string;
  provisioning_status: string;
  participation_status: string;
  location_count: number;
};

function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isInsightProductKey(value: unknown): value is InsightProductKey {
  return [
    "insight-pd-last-mile",
    "insight-telecom-fulfillment",
    "utility-locate-service",
  ].includes(String(value));
}

function asProducts(value: unknown): Product[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Product => {
    if (!item || typeof item !== "object") return false;
    const product = item as Partial<Product>;
    return (
      isInsightProductKey(product.product_key) &&
      typeof product.product_name === "string" &&
      typeof product.product_short_name === "string" &&
      typeof product.product_status === "string"
    );
  });
}

export default function CompanySwitcher() {
  const pathname = usePathname();
  const routeProductKey = productKeyFromPathname(pathname);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductKey, setSelectedProductKey] = useState<InsightProductKey | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const loadProducts = useCallback(async () => {
    if (products.length || loadingProducts) return;
    setLoadingProducts(true);
    try {
      const response = await fetch("/api/teamoptix/companies", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to load products.");
      setProducts(asProducts(payload.products));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load products.");
    } finally {
      setLoadingProducts(false);
    }
  }, [loadingProducts, products.length]);

  const loadCompanies = useCallback(async (productKey: InsightProductKey) => {
    setLoadingCompanies(true);
    setCompanies([]);
    setError(null);
    try {
      const response = await fetch(
        `/api/teamoptix/companies?product=${encodeURIComponent(productKey)}`,
        { cache: "no-store" }
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to load companies.");
      setCompanies(Array.isArray(payload.companies) ? payload.companies : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load companies.");
    } finally {
      setLoadingCompanies(false);
    }
  }, []);

  const selectProduct = useCallback((productKey: InsightProductKey) => {
    setSelectedProductKey(productKey);
    setQuery("");
    void loadCompanies(productKey);
  }, [loadCompanies]);

  const openSwitcher = useCallback(async () => {
    setOpen(true);
    setError(null);
    setQuery("");
    setSelectedProductKey(routeProductKey);
    await loadProducts();
    if (routeProductKey) await loadCompanies(routeProductKey);
  }, [loadCompanies, loadProducts, routeProductKey]);

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
    if (selectedProductKey) requestAnimationFrame(() => searchRef.current?.focus());
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, selectedProductKey]);

  const selectedProduct = products.find(
    (product) => product.product_key === selectedProductKey
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return companies;
    return companies.filter((company) =>
      `${company.company_name} ${company.legal_name ?? ""} ${company.company_slug}`
        .toLowerCase()
        .includes(needle)
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
                <p className="value-card__eyebrow">
                  {selectedProduct ? selectedProduct.product_name : "Team Optix workspaces"}
                </p>
                <h2 id="company-switcher-title">
                  {selectedProductKey ? "Open a company" : "Choose a product"}
                </h2>
              </div>
              <button className="company-switcher__close" type="button" onClick={() => setOpen(false)} aria-label="Close company switcher">×</button>
            </header>

            {selectedProductKey ? (
              <>
                <div className="company-switcher__context">
                  <button type="button" onClick={() => {
                    setSelectedProductKey(null);
                    setCompanies([]);
                    setQuery("");
                    setError(null);
                  }}>← Products</button>
                  <span>{selectedProduct?.product_short_name ?? "Selected product"}</span>
                </div>

                <label className="company-switcher__search">
                  <span aria-hidden="true">⌕</span>
                  <input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search authorized companies" />
                  <kbd>Esc</kbd>
                </label>

                <div className="company-switcher__list">
                  {loadingCompanies ? <p className="company-switcher__empty">Loading companies…</p> : null}
                  {!loadingCompanies && error ? <p className="company-switcher__empty company-switcher__empty--error">{error}</p> : null}
                  {!loadingCompanies && !error && filtered.length === 0 ? (
                    <p className="company-switcher__empty">No companies are configured for this product.</p>
                  ) : null}
                  {filtered.map((company) => (
                    <Link
                      className="company-switcher__row"
                      href={companyProductHref(selectedProductKey, company.company_slug)}
                      key={company.id}
                      onClick={() => setOpen(false)}
                    >
                      <span className="company-switcher__monogram">{company.company_name.slice(0, 2).toUpperCase()}</span>
                      <span className="company-switcher__identity">
                        <strong>{company.company_name}</strong>
                        <small>
                          {company.legal_name
                            ? `Legal: ${company.legal_name}`
                            : "Legal name not confirmed"}
                        </small>
                        <small>
                          {company.location_count
                            ? `${company.location_count} active location${company.location_count === 1 ? "" : "s"}`
                            : titleCase(company.provisioning_status)}
                        </small>
                      </span>
                      <span className="company-switcher__status">Open</span>
                      <span aria-hidden="true">→</span>
                    </Link>
                  ))}
                </div>
              </>
            ) : (
              <div className="company-switcher__products">
                {loadingProducts ? <p className="company-switcher__empty">Loading products…</p> : null}
                {!loadingProducts && error ? <p className="company-switcher__empty company-switcher__empty--error">{error}</p> : null}
                {products.map((product) => (
                  <button
                    className="company-switcher__product"
                    type="button"
                    key={product.product_key}
                    onClick={() => selectProduct(product.product_key)}
                  >
                    <span>
                      <strong>{product.product_name}</strong>
                      <small>{titleCase(product.product_status)}</small>
                    </span>
                    <span>
                      {product.company_count} {product.company_count === 1 ? "company" : "companies"}
                      <b aria-hidden="true">→</b>
                    </span>
                  </button>
                ))}
              </div>
            )}

            <footer className="company-switcher__footer">
              <span>Product selection controls which companies can be opened.</span>
              <Link href="/teamoptix/customers" onClick={() => setOpen(false)}>Manage companies →</Link>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}
