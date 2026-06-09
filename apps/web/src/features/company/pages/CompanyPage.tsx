"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useAccess } from "@/features/access/AccessProvider";
import { useLob } from "@/features/lob/hooks/useLob";

type CompanyRecord = {
  id: string;
  company_name: string;
  company_slug: string;
  company_status: string;
  industry_label: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  website_url: string | null;
  company_size_band: string | null;
  created_at: string | null;
};

const SIZE_OPTIONS = ["1-9", "10-49", "50-199", "200-999", "1000+"];

function SectionCard(props: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  const { eyebrow, title, children } = props;

  return (
    <article className="app-card" style={{ padding: 14 }}>
      <p className="value-card__eyebrow">{eyebrow}</p>
      <h3 className="app-card__title" style={{ fontSize: 18 }}>
        {title}
      </h3>
      <div style={{ marginTop: 10 }}>{children}</div>
    </article>
  );
}

function MiniStat(props: { label: string; value: string }) {
  const { label, value } = props;

  return (
    <div className="context-stat" style={{ padding: "9px 10px" }}>
      <span className="context-stat__label">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export default function CompanyPage() {
  const params = useParams();
  const access = useAccess();
  const lob = useLob();
  const slug = String(params?.slug ?? "");

  const [company, setCompany] = useState<CompanyRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [companySizeBand, setCompanySizeBand] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const membership = useMemo(
    () => access.memberships.find((m) => m.company_slug === slug) ?? null,
    [access.memberships, slug]
  );

  const canEditCompany =
    Boolean(access.is_platform_owner) ||
    (membership?.relationship_type === "admin" &&
      membership?.membership_status === "active");

  useEffect(() => {
    let active = true;

    async function loadCompany() {
      try {
        setLoading(true);
        setPageError(null);

        const res = await fetch(`/api/company/${slug}`, {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        });

        const data = await res.json();

        if (!active) return;

        if (!res.ok) {
          setCompany(null);
          setPageError(data?.error ?? "Failed to load company.");
          return;
        }

        const record = data?.company ?? null;
        setCompany(record);
        setContactEmail(record?.contact_email ?? "");
        setContactPhone(record?.contact_phone ?? "");
        setWebsiteUrl(record?.website_url ?? "");
        setCompanySizeBand(record?.company_size_band ?? "");
      } catch {
        if (!active) return;
        setCompany(null);
        setPageError("Failed to load company.");
      } finally {
        if (active) setLoading(false);
      }
    }

    if (slug) {
      loadCompany();
    } else {
      setLoading(false);
      setPageError("Missing company slug.");
    }

    return () => {
      active = false;
    };
  }, [slug]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    setSaveMessage(null);

    try {
      const res = await fetch(`/api/company/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          contact_email: contactEmail,
          contact_phone: contactPhone,
          website_url: websiteUrl,
          company_size_band: companySizeBand,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setSaveError(data?.error ?? "Failed to save company settings.");
        return;
      }

      setCompany((prev) =>
        prev
          ? {
              ...prev,
              contact_email: data.company?.contact_email ?? contactEmail,
              contact_phone: data.company?.contact_phone ?? contactPhone,
              website_url: data.company?.website_url ?? websiteUrl,
              company_size_band:
                data.company?.company_size_band ?? companySizeBand,
            }
          : prev
      );

      setSaveMessage("Company settings saved.");
    } catch {
      setSaveError("Failed to save company settings.");
    } finally {
      setSaving(false);
    }
  }

  const heading = loading ? "Loading company" : company?.company_name ?? slug;
  const industryLabel = company?.industry_label ?? "Not assigned";
  const statusLabel = company?.company_status ?? "Unknown";
  const createdLabel = company?.created_at
    ? new Date(company.created_at).toLocaleDateString()
    : "Unknown";

  return (
    <main className="workspace-shell">
      <section className="workspace-main" style={{ paddingTop: 0, paddingBottom: 24 }}>
        {pageError ? (
          <section style={{ marginBottom: 10 }} className="app-card">
            <p style={{ color: "#c62828", margin: 0 }}>{pageError}</p>
          </section>
        ) : null}

        <section
          id="profile"
          className="app-card"
          style={{ padding: 14, marginBottom: 10 }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) auto",
              gap: 12,
              alignItems: "center",
            }}
          >
            <div>
              <p className="value-card__eyebrow">Operating profile</p>
              <h2 style={{ margin: "4px 0 0", fontSize: 22 }}>
                {heading}
              </h2>
            </div>

            <div className="cta-row" style={{ margin: 0 }}>
              <Link className="button" href={`/company/${slug}/operations`}>
                Operations
              </Link>
              <Link className="button" href={`/company/${slug}/schedule`}>
                Schedule
              </Link>
              <Link className="button" href={`/company/${slug}/people`}>
                People
              </Link>
            </div>
          </div>

          <div
            className="context-grid"
            style={{
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: 8,
              marginTop: 10,
            }}
          >
            <MiniStat label="LOB" value={lob.lob_label} />
            <MiniStat label="Industry" value={industryLabel} />
            <MiniStat label="Status" value={statusLabel} />
            <MiniStat
              label="Membership"
              value={
                membership
                  ? `${membership.relationship_type} · ${membership.membership_status}`
                  : "No match"
              }
            />
          </div>
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) 360px",
            gap: 10,
            alignItems: "start",
          }}
        >
          <section style={{ display: "grid", gap: 10 }}>
            <section
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: 10,
              }}
            >
              <SectionCard eyebrow="Current day" title="Today">
                <div id="today" style={{ display: "grid", gap: 8 }}>
                  <MiniStat label="Dispatch" value="Not loaded" />
                  <MiniStat label="Delivery risks" value="Pending data" />
                  <MiniStat label="Last updated" value="No source yet" />
                </div>
              </SectionCard>

              <SectionCard eyebrow="Prior day" title="Snapshot">
                <div id="prior-day" style={{ display: "grid", gap: 8 }}>
                  <MiniStat label="DSW" value="Awaiting upload" />
                  <MiniStat label="FCC" value="Awaiting upload" />
                  <MiniStat label="Report artifact" value="Not generated" />
                </div>
              </SectionCard>

              <SectionCard eyebrow="Future readiness" title="Tomorrow">
                <div id="readiness" style={{ display: "grid", gap: 8 }}>
                  <MiniStat label="DRO PM" value="Awaiting upload" />
                  <MiniStat label="Coverage" value="Pending schedule" />
                  <MiniStat label="Open gaps" value="Unknown" />
                </div>
              </SectionCard>
            </section>

            <SectionCard eyebrow="Operations config" title="Terminal / Contract / Service Area">
              <div id="config">
                <p className="app-card__body">
                  Configure FedEx operating facts used to validate report uploads before warehouse persistence.
                </p>

                <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                  <MiniStat label="Terminal" value="Pending beta files" />
                  <MiniStat label="Contract" value="Pending beta files" />
                  <MiniStat label="Service area" value="Pending beta files" />
                </div>

                <div className="cta-row" style={{ marginTop: 14 }}>
                  <button type="button" className="button" disabled>
                    Add config row
                  </button>
                </div>
              </div>
            </SectionCard>
          </section>

          <aside style={{ display: "grid", gap: 10 }}>
            <SectionCard eyebrow="Company profile" title="Settings">
              {canEditCompany ? (
                <form onSubmit={handleSave} style={{ display: "grid", gap: 10 }}>
                  <input value={company?.company_name ?? ""} disabled style={inputStyleDisabled} />
                  <input value={company?.company_slug ?? ""} disabled style={inputStyleDisabled} />
                  <input value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="Website" style={inputStyle} />
                  <input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="Contact email" style={inputStyle} />
                  <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="Contact phone" style={inputStyle} />
                  <select value={companySizeBand} onChange={(e) => setCompanySizeBand(e.target.value)} style={inputStyle}>
                    <option value="">Company size</option>
                    {SIZE_OPTIONS.map((size) => (
                      <option key={size} value={size}>{size}</option>
                    ))}
                  </select>

                  {saveError ? <p style={{ color: "#c62828", margin: 0 }}>{saveError}</p> : null}
                  {saveMessage ? <p style={{ color: "#0f9f6e", margin: 0 }}>{saveMessage}</p> : null}

                  <button type="submit" className="button button-primary" disabled={saving}>
                    {saving ? "Saving..." : "Save company info"}
                  </button>
                </form>
              ) : (
                <p className="app-card__body">You do not have permission to edit this company.</p>
              )}
            </SectionCard>

            <SectionCard eyebrow="Leadership" title="Assignments">
              <div style={{ display: "grid", gap: 8 }}>
                <MiniStat label="Operations manager" value="Pending roster link" />
                <MiniStat label="Fleet manager" value="Pending roster link" />
                <MiniStat label="Dispatch supervisor" value="Pending roster link" />
                <MiniStat label="Operations supervisor" value="Pending roster link" />
              </div>
            </SectionCard>

            <SectionCard eyebrow="Workspace" title="Lifecycle">
              <div style={{ display: "grid", gap: 8 }}>
                <MiniStat label="Created" value={createdLabel} />
                <MiniStat label="Profile status" value={statusLabel} />
              </div>
            </SectionCard>
          </aside>
        </section>
      </section>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  height: 44,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid #d6dfeb",
  background: "#fff",
};

const inputStyleDisabled: React.CSSProperties = {
  ...inputStyle,
  background: "#f4f7fb",
};
