"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useAccess } from "@/features/access/AccessProvider";
import { hasMobileWorkspaceAccess } from "@/features/mobile-workspace/mobileWorkspace";
import { useLob } from "@/features/lob/hooks/useLob";
import CompanyConfigWorkspace, { type CompanyConfigSection } from "@/features/company/config/CompanyConfigWorkspace";
import DailyOperationsSummary from "@/features/company/components/DailyOperationsSummary";
import PayrollWorkspace from "@/features/payroll/components/PayrollWorkspace";
import OperationsReportUploadOverlay from "@/features/operations/components/OperationsReportUploadOverlay";

type CompanyRecord = {
  id: string;
  company_name: string;
  company_slug: string;
  company_status: string;
  industry_label: string | null;
  authorized_operator_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  website_url: string | null;
  company_size_band: string | null;
  created_at: string | null;
};

type LegalTaskSummary = {
  open_count: number;
  customer_action_count: number;
  teamoptix_action_count: number;
  tasks: Array<{
    id: string;
    status: string | null;
    document_title: string | null;
    version_label: string | null;
    blocking_reason: string | null;
  }>;
};

type CompanyOverview = {
  generated_at: string;
  profile: {
    company_name: string;
    company_slug: string;
    company_status: string;
    industry_label: string | null;
    created_at: string | null;
  };
  operating_profile: {
    average_daily_routes: number;
    active_driver_count: number;
    company_user_count: number;
    primary_terminal: string | null;
    active_contract_number: string | null;
    service_area: string | null;
    last_report: {
      family: string;
      service_date: string;
    } | null;
  };
  analytics: {
    window: string;
    history_count: number;
    latest_service_date: string | null;
    latest: {
      routes: number;
      stops: number;
      packages: number;
    };
    average: {
      routes: number;
      stops: number;
      packages: number;
    };
    delta_pct: {
      routes: number;
      stops: number;
      packages: number;
    };
    signal: string;
  };
};

type OverviewSurface = "profile" | "payroll" | "prior-day" | "analytics" | "config";

const SIZE_OPTIONS = ["1-9", "10-49", "50-199", "200-999", "1000+"];

function getSurfaceFromPath(pathname: string): OverviewSurface {
  if (pathname.includes("/payroll")) return "payroll";
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

function titleCase(value: string | null | undefined) {
  const text = String(value ?? "").trim();

  if (!text) return "Not available";

  return text
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map(
      (part) =>
        part.slice(0, 1).toUpperCase() + part.slice(1).toLowerCase()
    )
    .join(" ");
}

function formatDate(value: string | null | undefined) {
  if (!value) return "No report loaded";

  return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString(
    undefined,
    {
      month: "short",
      day: "numeric",
      year: "numeric",
    }
  );
}

function formatWorkspaceAge(value: string | null | undefined) {
  if (!value) return "Unknown";

  const started = new Date(value);

  if (Number.isNaN(started.getTime())) return "Unknown";

  const elapsedDays = Math.max(
    0,
    Math.floor((Date.now() - started.getTime()) / 86_400_000)
  );

  if (elapsedDays < 14) {
    return `${elapsedDays} day${elapsedDays === 1 ? "" : "s"}`;
  }

  if (elapsedDays < 60) {
    return `${Math.floor(elapsedDays / 7)} weeks`;
  }

  const months = Math.floor(elapsedDays / 30.4375);

  if (months < 24) {
    return `${months} months`;
  }

  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;

  return remainingMonths > 0
    ? `${years}y ${remainingMonths}m`
    : `${years} year${years === 1 ? "" : "s"}`;
}

function formatCount(value: number | null | undefined) {
  return Number.isFinite(value)
    ? Number(value).toLocaleString()
    : "—";
}

function formatAverage(value: number | null | undefined) {
  if (!Number.isFinite(value) || Number(value) <= 0) {
    return "No history";
  }

  const number = Number(value);

  return Number.isInteger(number)
    ? number.toLocaleString()
    : number.toLocaleString(undefined, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      });
}

function formatDelta(value: number | null | undefined) {
  if (!Number.isFinite(value)) return "—";

  const number = Number(value);
  return `${number > 0 ? "+" : ""}${number.toFixed(1)}%`;
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
  const [overview, setOverview] = useState<CompanyOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [legalTasks, setLegalTasks] = useState<LegalTaskSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const [contactEmail, setContactEmail] = useState("");
  const [authorizedOperatorName, setAuthorizedOperatorName] = useState("");
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
  const hasScopedMobileWorkspaces = hasMobileWorkspaceAccess(access, slug);

  useEffect(() => {
    if (access.loading || !slug || pathname !== `/company/${slug}`) return;

    if (hasScopedMobileWorkspaces) {
      router.replace(`/company/${slug}/workspace`);
      return;
    }

    if (!isCompanyAdmin) router.replace(`/company/${slug}/home`);
  }, [access.loading, hasScopedMobileWorkspaces, isCompanyAdmin, pathname, router, slug]);

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
        setAuthorizedOperatorName(record?.authorized_operator_name ?? "");
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

  useEffect(() => {
    let active = true;

    async function loadOverview() {
      try {
        setOverviewLoading(true);
        setOverviewError(null);

        const res = await fetch(`/api/company/${slug}/overview`, {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        });

        const data = await res.json();

        if (!active) return;

        if (!res.ok) {
          setOverview(null);
          setOverviewError(
            data?.error ?? "Failed to load company operating profile."
          );
          return;
        }

        setOverview(data as CompanyOverview);
      } catch {
        if (!active) return;

        setOverview(null);
        setOverviewError("Failed to load company operating profile.");
      } finally {
        if (active) setOverviewLoading(false);
      }
    }

    if (slug) {
      void loadOverview();
    } else {
      setOverviewLoading(false);
    }

    return () => {
      active = false;
    };
  }, [slug]);

  useEffect(() => {
    let active = true;

    async function loadLegalTasks() {
      try {
        const res = await fetch(`/api/company/${slug}/legal/tasks`, {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        });
        const data = await res.json();

        if (!active) return;

        setLegalTasks(
          res.ok
            ? {
                open_count: Number(data?.open_count ?? 0) || 0,
                customer_action_count: Number(data?.customer_action_count ?? 0) || 0,
                teamoptix_action_count: Number(data?.teamoptix_action_count ?? 0) || 0,
                tasks: Array.isArray(data?.tasks) ? data.tasks : [],
              }
            : null
        );
      } catch {
        if (active) setLegalTasks(null);
      }
    }

    if (slug && isCompanyAdmin) void loadLegalTasks();
    else setLegalTasks(null);

    return () => {
      active = false;
    };
  }, [isCompanyAdmin, slug]);

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
          authorized_operator_name: authorizedOperatorName,
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
              authorized_operator_name:
                data.company?.authorized_operator_name ?? authorizedOperatorName,
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
  const statusLabel = titleCase(company?.company_status);
  const membershipLabel = membership
    ? `${titleCase(membership.relationship_type)} · ${titleCase(
        membership.membership_status
      )}`
    : "No membership";

  const operatingProfile = overview?.operating_profile ?? null;
  const analytics = overview?.analytics ?? null;

  const averageRoutesLabel = overviewLoading
    ? "Loading…"
    : formatAverage(operatingProfile?.average_daily_routes);

  const activeDriversLabel = overviewLoading
    ? "Loading…"
    : formatCount(operatingProfile?.active_driver_count);

  const companyUsersLabel = overviewLoading
    ? "Loading…"
    : formatCount(operatingProfile?.company_user_count);

  const workspaceAgeLabel = formatWorkspaceAge(
    overview?.profile.created_at ?? company?.created_at
  );

  const lastReportLabel = operatingProfile?.last_report
    ? `${operatingProfile.last_report.family} · ${formatDate(
        operatingProfile.last_report.service_date
      )}`
    : overviewLoading
      ? "Loading…"
      : "No report loaded";

  const analyticsSummary = !analytics
    ? "Operational history will appear after finalized DSW reports are available."
    : analytics.history_count === 0
      ? "The latest operating day is available, but more finalized history is needed before Insight can calculate a meaningful comparison."
      : `On ${formatDate(
          analytics.latest_service_date
        )}, route volume was ${formatDelta(
          analytics.delta_pct.routes
        )} versus the recent operating average. Stops were ${formatDelta(
          analytics.delta_pct.stops
        )} and packages were ${formatDelta(
          analytics.delta_pct.packages
        )} across ${analytics.history_count} prior operating days.`;

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
            {legalTasks && legalTasks.open_count > 0 ? (
              <SectionCard
                eyebrow="Customer Admin · Legal"
                title="Signature Required"
                action={
                  <Link
                    className="primary-action"
                    href={`/company/${slug}/admin/legal/required`}
                    style={{
                      alignItems: "center",
                      background: "#dc2626",
                      border: "1px solid #dc2626",
                      borderRadius: 999,
                      color: "#ffffff",
                      display: "inline-flex",
                      fontSize: 13,
                      fontWeight: 800,
                      justifyContent: "center",
                      lineHeight: 1,
                      minHeight: 34,
                      padding: "0 16px",
                      textDecoration: "none",
                    }}
                  >
                    Review
                  </Link>
                }
              >
                <p className="app-card__body" style={{ margin: 0 }}>
                  {legalTasks.customer_action_count > 0
                    ? `${legalTasks.customer_action_count} locked legal document${legalTasks.customer_action_count === 1 ? " is" : "s are"} waiting for customer review and acceptance.`
                    : "Customer legal acceptance is complete. Team Optix finalization is pending."}
                </p>
              </SectionCard>
            ) : null}

            <SectionCard eyebrow="Operating profile" title={heading}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
                <MiniStat label="Avg daily routes" value={averageRoutesLabel} />
                <MiniStat label="Active drivers" value={activeDriversLabel} />
                <MiniStat label="Company users" value={companyUsersLabel} />
                <MiniStat label="Time in platform" value={workspaceAgeLabel} />
                <MiniStat
                  label="Primary terminal"
                  value={
                    overviewLoading
                      ? "Loading…"
                      : operatingProfile?.primary_terminal || "Not configured"
                  }
                />
                <MiniStat
                  label="Active contract"
                  value={
                    overviewLoading
                      ? "Loading…"
                      : operatingProfile?.active_contract_number || "Not configured"
                  }
                />
                <MiniStat
                  label="Service area"
                  value={
                    overviewLoading
                      ? "Loading…"
                      : operatingProfile?.service_area || "Not configured"
                  }
                />
                <MiniStat label="Last report loaded" value={lastReportLabel} />
              </div>

              {overviewError ? (
                <p
                  className="app-card__body"
                  style={{ marginTop: 10, color: "#b91c1c" }}
                >
                  {overviewError}
                </p>
              ) : null}
            </SectionCard>

            <SectionCard eyebrow="Context" title="Company posture">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
                <MiniStat label="LOB" value={lob.lob_label} />
                <MiniStat label="Industry" value={industryLabel} />
                <MiniStat label="Status" value={statusLabel} />
                <MiniStat label="Membership" value={membershipLabel} />
              </div>
            </SectionCard>
          </section>
        ) : null}

        {activeSurface === "payroll" ? <PayrollWorkspace slug={slug} /> : null}

        {activeSurface === "prior-day" ? (
          <div className="operations-reports-scope">
          <SectionCard
            eyebrow="Daily operations"
            title="Summary"
            action={
              <button
                type="button"
                className="button button-primary"
                onClick={() => setUploadOpen(true)}
              >
                Upload Final Report
              </button>
            }
          >
            <DailyOperationsSummary slug={slug} />
          </SectionCard>
          </div>
        ) : null}

        {activeSurface === "analytics" ? (
          <section style={{ display: "grid", gap: 10 }}>
            <SectionCard eyebrow="Analytics" title="Operating intelligence">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
                <MiniStat
                  label="Latest routes"
                  value={
                    overviewLoading
                      ? "Loading…"
                      : formatCount(analytics?.latest.routes)
                  }
                />
                <MiniStat
                  label="Latest stops"
                  value={
                    overviewLoading
                      ? "Loading…"
                      : formatCount(analytics?.latest.stops)
                  }
                />
                <MiniStat
                  label="Latest packages"
                  value={
                    overviewLoading
                      ? "Loading…"
                      : formatCount(analytics?.latest.packages)
                  }
                />
                <MiniStat
                  label="Demand signal"
                  value={
                    overviewLoading
                      ? "Loading…"
                      : titleCase(analytics?.signal)
                  }
                />
              </div>
            </SectionCard>

            <SectionCard
              eyebrow="Operational trends"
              title="Recent operating baseline"
            >
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
                <MiniStat
                  label="Average routes"
                  value={
                    overviewLoading
                      ? "Loading…"
                      : formatAverage(analytics?.average.routes)
                  }
                />
                <MiniStat
                  label="Route change"
                  value={
                    overviewLoading
                      ? "Loading…"
                      : formatDelta(analytics?.delta_pct.routes)
                  }
                />
                <MiniStat
                  label="Stop change"
                  value={
                    overviewLoading
                      ? "Loading…"
                      : formatDelta(analytics?.delta_pct.stops)
                  }
                />
                <MiniStat
                  label="Package change"
                  value={
                    overviewLoading
                      ? "Loading…"
                      : formatDelta(analytics?.delta_pct.packages)
                  }
                />
              </div>
            </SectionCard>

            <SectionCard eyebrow="Decision support" title="Company signal">
              <p className="app-card__body" style={{ margin: 0 }}>
                {overviewLoading
                  ? "Loading operating intelligence…"
                  : analyticsSummary}
              </p>

              {overviewError ? (
                <p
                  className="app-card__body"
                  style={{ marginTop: 10, color: "#b91c1c" }}
                >
                  {overviewError}
                </p>
              ) : null}
            </SectionCard>
          </section>
        ) : null}

        {activeSurface === "config" ? (
          <CompanyConfigWorkspace
            slug={slug}
            section={activeConfigSection}
            company={company}
            canEditCompany={canEditCompany}
            authorizedOperatorName={authorizedOperatorName}
            contactEmail={contactEmail}
            contactPhone={contactPhone}
            websiteUrl={websiteUrl}
            companySizeBand={companySizeBand}
            saving={saving}
            saveError={saveError}
            saveMessage={saveMessage}
            sizeOptions={SIZE_OPTIONS}
            onContactEmailChange={setContactEmail}
            onAuthorizedOperatorNameChange={setAuthorizedOperatorName}
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
