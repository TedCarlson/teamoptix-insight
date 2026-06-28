// apps/web/src/app/company/setup/page.tsx

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAccess } from "@/features/access/AccessProvider";
import SiteHeader from "@/features/landing/components/SiteHeader";

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

type Industry = {
  id: string;
  industry_label: string;
};

export default function CompanySetupPage() {
  const access = useAccess();
  const router = useRouter();

  const canCreateCompany = Boolean(access.is_platform_owner);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [industry, setIndustry] = useState("");
  const [industries, setIndustries] = useState<Industry[]>([]);
  const [contactEmail, setContactEmail] = useState(access.email ?? "");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [sizeBand, setSizeBand] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleNameChange(v: string) {
    setName(v);
    setSlug(slugify(v));
  }

  useEffect(() => {
    async function loadIndustries() {
      try {
        const res = await fetch("/api/company/industries", {
          method: "GET",
          cache: "no-store",
        });

        const data = await res.json();

        if (Array.isArray(data.industries)) {
          setIndustries(data.industries);
        } else {
          setIndustries([]);
        }
      } catch {
        setIndustries([]);
      }
    }

    loadIndustries();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/company/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: name,
          company_slug: slug,
          primary_industry: industry,
          contact_email: contactEmail,
          contact_phone: phone || null,
          website_url: website || null,
          company_size_band: sizeBand || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Failed to create company.");
        return;
      }

      router.push(`/company/${data.company_slug}`);
      router.refresh();
    } catch {
      setError("Unexpected error creating company.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="landing-page">
      <SiteHeader />

      <section className="hero">
        <div className="hero__grid">
          <section className="hero-card hero-card--primary">
            <p className="eyebrow">Company</p>
            <h1>Create company</h1>

            {!canCreateCompany ? (
              <p className="lede">
                Company creation is restricted to platform owners.
              </p>
            ) : (
              <form onSubmit={submit} style={{ marginTop: 24 }}>
                <div style={{ display: "grid", gap: 14 }}>
                  <input
                    placeholder="Company name"
                    value={name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    required
                    style={inputStyle}
                  />

                  <input
                    placeholder="Company slug"
                    value={slug}
                    onChange={(e) => setSlug(slugify(e.target.value))}
                    required
                    style={inputStyle}
                  />

                  <select
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    required
                    style={inputStyle}
                  >
                    <option value="">Select industry</option>
                    {industries.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.industry_label}
                      </option>
                    ))}
                  </select>

                  <input
                    placeholder="Contact email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    required
                    style={inputStyle}
                  />

                  <input
                    placeholder="Phone (optional)"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    style={inputStyle}
                  />

                  <input
                    placeholder="Website (optional)"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    style={inputStyle}
                  />

                  <select
                    value={sizeBand}
                    onChange={(e) => setSizeBand(e.target.value)}
                    style={inputStyle}
                  >
                    <option value="">Company size</option>
                    <option>1-9</option>
                    <option>10-49</option>
                    <option>50-199</option>
                    <option>200-999</option>
                    <option>1000+</option>
                  </select>
                </div>

                {error && (
                  <p style={{ color: "#c62828", marginTop: 14 }}>{error}</p>
                )}

                <div className="cta-row" style={{ marginTop: 20 }}>
                  <button
                    type="submit"
                    className="button button-primary"
                    disabled={loading}
                  >
                    {loading ? "Creating..." : "Create company"}
                  </button>

                  <Link className="button" href="/profile">
                    Not right now
                  </Link>
                </div>
              </form>
            )}
          </section>

          <aside className="hero-card hero-card--secondary">
            <p className="eyebrow">Access</p>

            <div className="hero-stat">
              <span className="hero-stat__label">User</span>
              <strong>{access.display_name || access.email}</strong>
            </div>

            <div className="hero-stat">
              <span className="hero-stat__label">Privilege</span>
              <strong>
                {canCreateCompany
                  ? "Platform Owner"
                  : "Company creation restricted"}
              </strong>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  height: 44,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid #d6dfeb",
};