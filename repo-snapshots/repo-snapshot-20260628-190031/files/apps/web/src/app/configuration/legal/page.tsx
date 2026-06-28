import SiteHeader from "@/features/landing/components/SiteHeader";

function LegalBlock(props: {
  eyebrow: string;
  title: string;
  description: string;
  status: string;
}) {
  return (
    <section
      style={{
        border: "1px solid var(--line)",
        borderRadius: 18,
        background: "rgba(255,255,255,0.74)",
        padding: 18,
        display: "grid",
        gap: 12,
      }}
    >
      <div style={{ display: "grid", gap: 4 }}>
        <p className="eyebrow">{props.eyebrow}</p>
        <h2 style={{ margin: 0, color: "var(--ink)", fontSize: 21, lineHeight: 1.1 }}>
          {props.title}
        </h2>
        <p style={{ margin: 0, color: "var(--muted)", fontWeight: 650, lineHeight: 1.45 }}>
          {props.description}
        </p>
      </div>

      <div
        style={{
          border: "1px solid var(--line)",
          borderRadius: 14,
          padding: "10px 12px",
          color: "var(--ink)",
          fontSize: 14,
          fontWeight: 800,
          background: "rgba(255,255,255,0.55)",
        }}
      >
        {props.status}
      </div>
    </section>
  );
}

export default function LegalConfigurationPage() {
  return (
    <main className="workspace-shell">
      <SiteHeader />

      <section className="workspace-main" style={{ gap: 18 }}>
        <header style={{ display: "grid", gap: 6 }}>
          <p className="eyebrow">Platform Configuration</p>
          <h1
            className="workspace-title"
            style={{ fontSize: "clamp(2rem, 3.4vw, 3.25rem)", margin: 0 }}
          >
            Legal & Compliance Center
          </h1>
          <p className="workspace-subtitle">
            Versioned governing documents for Insight commercial relationships, platform use, privacy, and service policies.
          </p>
        </header>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 16,
            alignItems: "start",
          }}
        >
          <LegalBlock
            eyebrow="Agreement"
            title="Master Service Agreement"
            description="The primary contract framework governing Insight service delivery."
            status="Draft v0.1 stored in repo"
          />

          <LegalBlock
            eyebrow="Platform Use"
            title="Terms of Service"
            description="The rules for authorized platform use, account conduct, and acceptable behavior."
            status="Pending draft"
          />

          <LegalBlock
            eyebrow="Data"
            title="Privacy Policy"
            description="How customer and user information is collected, used, protected, retained, and deleted."
            status="Pending draft"
          />

          <LegalBlock
            eyebrow="Security"
            title="Data Processing & Security"
            description="Data handling, subprocessors, retention, deletion, access controls, and operational safeguards."
            status="Pending draft"
          />

          <LegalBlock
            eyebrow="Service"
            title="Service Policies"
            description="Support expectations, maintenance windows, service availability, billing policies, and customer responsibilities."
            status="Pending draft"
          />

          <LegalBlock
            eyebrow="Governance"
            title="Document Governance"
            description="Version history, effective dates, customer acceptance, review status, and change tracking."
            status="Scaffolded"
          />
        </section>
      </section>
    </main>
  );
}
