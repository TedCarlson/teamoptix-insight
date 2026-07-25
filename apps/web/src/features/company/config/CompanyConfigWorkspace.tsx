import CompanyContractConfigManager from "@/features/company/components/CompanyContractConfigManager";
import CompanyRouteSortConfig from "@/features/company/components/CompanyRouteSortConfig";
import CompanyTimekeepingOversightConfig from "@/features/company/components/CompanyTimekeepingOversightConfig";
import CompanyConfigAccessPanel from "./CompanyConfigAccessPanel";
import AutomationConfigPanel from "@/features/automation/components/AutomationConfigPanel";
import CompanyLeadershipManager from "./CompanyLeadershipManager";

export type CompanyConfigSection = "company" | "leadership" | "access" | "operations" | "automation";

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

type CompanyConfigWorkspaceProps = {
  slug: string;
  section: CompanyConfigSection;
  company: CompanyRecord | null;
  canEditCompany: boolean;
  contactEmail: string;
  contactPhone: string;
  websiteUrl: string;
  companySizeBand: string;
  saving: boolean;
  saveError: string | null;
  saveMessage: string | null;
  sizeOptions: string[];
  onContactEmailChange: (value: string) => void;
  onContactPhoneChange: (value: string) => void;
  onWebsiteUrlChange: (value: string) => void;
  onCompanySizeBandChange: (value: string) => void;
  onSave: (event: React.FormEvent<HTMLFormElement>) => void;
};

function SectionCard(props: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <article className="app-card" style={{ padding: 14 }}>
      <p className="value-card__eyebrow">{props.eyebrow}</p>
      <h3 className="app-card__title" style={{ fontSize: 18 }}>{props.title}</h3>
      <div style={{ marginTop: 10 }}>{props.children}</div>
    </article>
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
  background: "#f8fafc",
  color: "#64748b",
};

function CompanySection(props: CompanyConfigWorkspaceProps) {
  return (
    <section style={{ display: "grid", gap: 10 }}>
      <SectionCard eyebrow="Company identity" title="Company profile">
        {props.canEditCompany ? (
          <form
            onSubmit={props.onSave}
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 10,
            }}
          >
            <input value={props.company?.company_name ?? ""} disabled style={inputStyleDisabled} />
            <input value={props.company?.company_slug ?? ""} disabled style={inputStyleDisabled} />
            <input
              value={props.websiteUrl}
              onChange={(e) => props.onWebsiteUrlChange(e.target.value)}
              placeholder="Website"
              style={inputStyle}
            />
            <input
              value={props.contactEmail}
              onChange={(e) => props.onContactEmailChange(e.target.value)}
              placeholder="AO / company contact email"
              style={inputStyle}
            />
            <input
              value={props.contactPhone}
              onChange={(e) => props.onContactPhoneChange(e.target.value)}
              placeholder="AO / company contact phone"
              style={inputStyle}
            />
            <select
              value={props.companySizeBand}
              onChange={(e) => props.onCompanySizeBandChange(e.target.value)}
              style={inputStyle}
            >
              <option value="">Company size</option>
              {props.sizeOptions.map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>

            <div style={{ gridColumn: "1 / -1" }}>
              {props.saveError ? <p style={{ color: "#c62828", margin: 0 }}>{props.saveError}</p> : null}
              {props.saveMessage ? <p style={{ color: "#0f9f6e", margin: 0 }}>{props.saveMessage}</p> : null}
            </div>

            <div className="cta-row" style={{ gridColumn: "1 / -1", marginTop: 0 }}>
              <button type="submit" className="button button-primary" disabled={props.saving}>
                {props.saving ? "Saving..." : "Save company profile"}
              </button>
            </div>
          </form>
        ) : (
          <p className="app-card__body">You do not have access to edit this company.</p>
        )}
      </SectionCard>

      <SectionCard eyebrow="Company identity" title="Contract / Terminal Identity / Service Area">
        <CompanyContractConfigManager slug={props.slug} canEdit={false} />
      </SectionCard>
    </section>
  );
}

function LeadershipSection(props: CompanyConfigWorkspaceProps) {
  return (
    <section style={{ display: "grid", gap: 10 }}>
      <SectionCard eyebrow="Leadership responsibility" title="Company leadership">
        <p className="app-card__body" style={{ margin: "0 0 12px" }}>
          Establish accountable company and workforce leaders.
        </p>
        <CompanyLeadershipManager slug={props.slug} />
      </SectionCard>
    </section>
  );
}

function AccessSection(props: CompanyConfigWorkspaceProps) {
  return (
    <section style={{ display: "grid", gap: 10 }}>
      <SectionCard eyebrow="Workforce access" title="Workspace access">
        <CompanyConfigAccessPanel slug={props.slug} />
      </SectionCard>
    </section>
  );
}

function OperationsSection(props: CompanyConfigWorkspaceProps) {
  return (
    <section style={{ display: "grid", gap: 10 }}>
      <SectionCard eyebrow="Operations preferences" title="Route ordering">
        <CompanyRouteSortConfig slug={props.slug} canEdit={props.canEditCompany} />
      </SectionCard>

      <SectionCard eyebrow="Timekeeping" title="Oversight lifecycle">
        <CompanyTimekeepingOversightConfig slug={props.slug} canEdit={props.canEditCompany} />
      </SectionCard>
    </section>
  );
}

export default function CompanyConfigWorkspace(props: CompanyConfigWorkspaceProps) {
  if (props.section === "leadership") return <LeadershipSection {...props} />;
  if (props.section === "access") return <AccessSection {...props} />;
  if (props.section === "operations") return <OperationsSection {...props} />;
  if (props.section === "automation") {
    return (
      <AutomationConfigPanel
        slug={props.slug}
        canEdit={props.canEditCompany}
        credentialMode="customer_managed"
        workspaceMode="customer"
      />
    );
  }
  return <CompanySection {...props} />;
}
