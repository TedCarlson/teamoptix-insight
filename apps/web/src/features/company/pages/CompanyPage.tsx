"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useAccess } from "@/features/access/AccessProvider";
import { useLob } from "@/features/lob/hooks/useLob";
import CompanyConfigWorkspace, { type CompanyConfigSection } from "@/features/company/config/CompanyConfigWorkspace";
import DailyOperationsSummary from "@/features/company/components/DailyOperationsSummary";
import PayrollGrid from "@/features/payroll/components/PayrollGrid";
import OperationsReportUploadOverlay from "@/features/operations/components/OperationsReportUploadOverlay";

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

type OverviewSurface = "profile" | "payroll" | "prior-day" | "analytics" | "config";

const SIZE_OPTIONS = ["1-9", "10-49", "50-199", "200-999", "1000+"];

function getSurfaceFromPath(pathname: string): OverviewSurface {
  if (pathname.endsWith("/payroll")) return "payroll";
  if (pathname.endsWith("/prior-day")) return "prior-day";
  if (pathname.endsWith("/analytics") || pathname.endsWith("/readiness")) return "analytics";
  if (pathname.includes("/config")) return "config";
  return "profile";
}

function getConfigSectionFromPath(pathname: string): CompanyConfigSection {
  if (pathname.endsWith("/config/leadership")) return "leadership";
  if (pathname.endsWith("/config/access")) return "access";
  if (pathname.endsWith("/config/operations")) return "operations";
  if (pathname.endsWith("/config/automation")) return "automation";
  return "company";
}

function SectionCard(props: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <article className="app-card" style={{ padding: 14 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
        }}
      >
        <div>
          <p className="value-card__eyebrow">{props.eyebrow}</p>
          <h3 className="app-card__title" style={{ fontSize: 18 }}>
            {props.title}
          </h3>
        </div>

        {props.action}
      </div>

      <div style={{ marginTop: 10 }}>{props.children}</div>
    </article>
  );
}

function MiniStat(props: { label: string; value: string }) {
  return (
    <div className="context-stat" style={{ padding: "9px 10px" }}>
      <span className="context-stat__label">{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

export default function CompanyPage() {
  const params = useParams();
  const access = useAccess();
  const lob = useLob();
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const slug = String(params?.slug ?? "");

  const [activeSurface, setActiveSurface] = useState<OverviewSurface>("profile");
  const [activeConfigSection, setActiveConfigSection] = useState<CompanyConfigSection>("company");
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

  const [uploadOpen, setUploadOpen] = useState(false);

  const membership = useMemo(
    () => access.memberships.find((m) => m.company_slug === slug) ?? null,
    [access.memberships, slug]
  );

  const canEditCompany =
    Boolean(access.is_platform_owner) ||
    (membership?.relationship_type === "admin" && membership?.membership_status === "active");

  const isCompanyAdmin = canEditCompany;

  useEffect(() => {
    if (!access.loading && slug && pathname === `/company/${slug}` && !isCompanyAdmin) {
      router.replace(`/company/${slug}/home`);
    }
  }, [access.loading, isCompanyAdmin, pathname, router, slug]);

  useEffect(() => {
    setActiveSurface(getSurfaceFromPath(pathname));
    setActiveConfigSection(getConfigSectionFromPath(pathname));
  }, [pathname]);

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

    if (slug) loadCompany();
    else {
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
              company_size_band: data.company?.company_size_band ?? companySizeBand,
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
  const createdLabel = company?.created_at ? new Date(company.created_at).toLocaleDateString() : "Unknown";

  return (
    <main className="workspace-shell">
      <section className="workspace-main" style={{ paddingTop: 0, paddingBottom: 24 }}>
        {pageError ? (
          <section style={{ marginBottom: 10 }} className="app-card">
            <p style={{ color: "#c62828", margin: 0 }}>{pageError}</p>
          </section>
        ) : null}

        {activeSurface === "profile" ? (
          <section style={{ display: "grid", gap: 10 }}>
            <SectionCard eyebrow="Operating profile" title={heading}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
                <MiniStat label="Avg daily routes" value="Pending DSW" />
                <MiniStat label="Active drivers" value="Pending roster" />
                <MiniStat label="Company users" value="Pending access" />
                <MiniStat label="Time in platform" value={createdLabel} />
                <MiniStat label="Primary terminal" value="Pending config" />
                <MiniStat label="Active contract" value="Pending config" />
                <MiniStat label="Service area" value="Pending config" />
                <MiniStat label="Last report loaded" value="No source yet" />
              </div>
            </SectionCard>

            <SectionCard eyebrow="Context" title="Company posture">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
                <MiniStat label="LOB" value={lob.lob_label} />
                <MiniStat label="Industry" value={industryLabel} />
                <MiniStat label="Status" value={statusLabel} />
                <MiniStat
                  label="Membership"
                  value={membership ? `${membership.relationship_type} · ${membership.membership_status}` : "No match"}
                />
              </div>
            </SectionCard>
          </section>
        ) : null}

        {activeSurface === "payroll" ? <PayrollGrid /> : null}

        {activeSurface === "prior-day" ? (
          <SectionCard
            eyebrow="Daily operations"
            title="Summary"
            action={
              <button
                type="button"
                className="button button-primary"
                onClick={() => setUploadOpen(true)}
              >
                Upload Operations Report
              </button>
            }
          >
            <DailyOperationsSummary slug={slug} />
          </SectionCard>
        ) : null}

        {activeSurface === "analytics" ? (
          <SectionCard eyebrow="Analytics" title="Analytics Engine">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
              <MiniStat label="Company signals" value="Coming soon" />
              <MiniStat label="Operational trends" value="Pending surface" />
              <MiniStat label="Readiness signals" value="Pending setup" />
            </div>
            <p className="app-card__body" style={{ marginTop: 12 }}>
              Analytics, readiness signals, operational trends, and decision-support summaries will surface here.
            </p>
          </SectionCard>
        ) : null}

        {activeSurface === "config" ? (
          <CompanyConfigWorkspace
            slug={slug}
            section={activeConfigSection}
            company={company}
            canEditCompany={canEditCompany}
            contactEmail={contactEmail}
            contactPhone={contactPhone}
            websiteUrl={websiteUrl}
            companySizeBand={companySizeBand}
            saving={saving}
            saveError={saveError}
            saveMessage={saveMessage}
            sizeOptions={SIZE_OPTIONS}
            onContactEmailChange={setContactEmail}
            onContactPhoneChange={setContactPhone}
            onWebsiteUrlChange={setWebsiteUrl}
            onCompanySizeBandChange={setCompanySizeBand}
            onSave={handleSave}
          />
        ) : null}
      </section>

      <OperationsReportUploadOverlay
        open={uploadOpen}
        onClose={(refresh) => {
          setUploadOpen(false);

          if (refresh) {
            window.location.reload();
          }
        }}
      />
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
