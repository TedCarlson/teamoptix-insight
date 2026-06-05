"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
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

function FieldCard(props: {
  eyebrow: string;
  title: string;
  body: string;
}) {
  const { eyebrow, title, body } = props;

  return (
    <article className="app-card">
      <p className="value-card__eyebrow">{eyebrow}</p>
      <h3 className="app-card__title">{title}</h3>
      <p className="app-card__body">{body}</p>
    </article>
  );
}

function SectionCard(props: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  const { eyebrow, title, children } = props;

  return (
    <article className="app-card">
      <p className="value-card__eyebrow">{eyebrow}</p>
      <h3 className="app-card__title">{title}</h3>
      <div style={{ marginTop: 12 }}>{children}</div>
    </article>
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
      <section className="workspace-main">
        <header className="workspace-header">
          <div style={{ display: "grid", gap: 10, alignContent: "center" }}>
            <p className="eyebrow">Company</p>
            <h1 className="workspace-title">{heading}</h1>
            <p className="workspace-subtitle">
              {loading
                ? "Resolving company context from the workspace slug."
                : company
                  ? "Company workspace for ownership, operations entry, and management."
                  : "This company workspace could not be resolved."}
            </p>

            {pageError ? (
              <p style={{ color: "#c62828", marginTop: 8 }}>{pageError}</p>
            ) : null}

            {!loading && company ? (
              <div className="cta-row">
                <Link className="button" href="/companies">
                  Back to companies
                </Link>
              </div>
            ) : null}
          </div>

          <aside className="context-grid">
            <div className="context-stat">
              <span className="context-stat__label">LOB</span>
              <strong>{lob.lob_label}</strong>
            </div>

            <div className="context-stat">
              <span className="context-stat__label">Industry</span>
              <strong>{industryLabel}</strong>
            </div>

            <div className="context-stat">
              <span className="context-stat__label">Membership</span>
              <strong>
                {membership
                  ? `${membership.relationship_type} · ${membership.membership_status}`
                  : "No match"}
              </strong>
            </div>

            <div className="context-stat">
              <span className="context-stat__label">Status</span>
              <strong>{statusLabel}</strong>
            </div>
          </aside>
        </header>

        <section className="workspace-grid">
          <SectionCard
            eyebrow="People"
            title="People / Employees / Hiring / Roster"
          >
            <p className="app-card__body">
              Manage employee profiles, hiring posture, leadership alignment, and
              the active roster that drives the company.
            </p>
            <div className="cta-row" style={{ marginTop: 14 }}>
              <Link
                className="button button-primary"
                href={`/company/${slug}/people`}
              >
                Open People
              </Link>
            </div>
          </SectionCard>

          <SectionCard eyebrow="Activity" title="Activity / Routes / Planning">
            <p className="app-card__body">
              Manage routes, operating activity, scheduling, planning, and the
              day-to-day work the company performs.
            </p>
            <div className="cta-row" style={{ marginTop: 14 }}>
              <Link
                className="button button-primary"
                href={`/company/${slug}/schedule`}
              >
                Schedule
              </Link>
              <Link className="button" href={`/company/${slug}/routes`}>
                Routes
              </Link>
            </div>
          </SectionCard>

          <SectionCard eyebrow="Reporting" title="Insights / Timing / Reporting">
            <p className="app-card__body">
              Make sense of people and activity through reporting, schedule
              posture, performance timing, and operational insight.
            </p>
            <div className="cta-row" style={{ marginTop: 14 }}>
              <Link
                className="button button-primary"
                href={`/company/${slug}/reporting`}
              >
                Open Reporting
              </Link>
            </div>
          </SectionCard>

          <SectionCard eyebrow="Company profile" title="Editable company settings">
            {canEditCompany ? (
              <form onSubmit={handleSave} style={{ display: "grid", gap: 12 }}>
                <input
                  value={company?.company_name ?? ""}
                  disabled
                  style={inputStyleDisabled}
                />
                <input
                  value={company?.company_slug ?? ""}
                  disabled
                  style={inputStyleDisabled}
                />
                <input
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  placeholder="Website"
                  style={inputStyle}
                />
                <input
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="Contact email"
                  style={inputStyle}
                />
                <input
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="Contact phone"
                  style={inputStyle}
                />
                <select
                  value={companySizeBand}
                  onChange={(e) => setCompanySizeBand(e.target.value)}
                  style={inputStyle}
                >
                  <option value="">Company size</option>
                  {SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>

                {saveError ? (
                  <p style={{ color: "#c62828", margin: 0 }}>{saveError}</p>
                ) : null}

                {saveMessage ? (
                  <p style={{ color: "#0f9f6e", margin: 0 }}>{saveMessage}</p>
                ) : null}

                <div className="cta-row" style={{ marginTop: 4 }}>
                  <button
                    type="submit"
                    className="button button-primary"
                    disabled={saving}
                  >
                    {saving ? "Saving..." : "Save company info"}
                  </button>
                </div>
              </form>
            ) : (
              <p className="app-card__body">
                You do not have permission to edit this company.
              </p>
            )}
          </SectionCard>

          <SectionCard eyebrow="Leadership" title="Leadership assignments">
            <div style={{ display: "grid", gap: 10 }}>
              <div className="context-stat">
                <span className="context-stat__label">Operations manager</span>
                <strong>Select from active roster when People lands</strong>
              </div>
              <div className="context-stat">
                <span className="context-stat__label">Fleet manager</span>
                <strong>Select from active roster when People lands</strong>
              </div>
              <div className="context-stat">
                <span className="context-stat__label">Dispatch supervisor</span>
                <strong>Select from active roster when People lands</strong>
              </div>
              <div className="context-stat">
                <span className="context-stat__label">Operations supervisor</span>
                <strong>Select from active roster when People lands</strong>
              </div>
            </div>
          </SectionCard>

          <FieldCard
            eyebrow="Workspace"
            title={statusLabel}
            body={`Created ${createdLabel}`}
          />
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
