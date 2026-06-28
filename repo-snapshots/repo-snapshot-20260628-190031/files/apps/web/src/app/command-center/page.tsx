"use client";

import { useAccess } from "@/features/access/AccessProvider";
import SiteHeader from "@/features/landing/components/SiteHeader";

function CommandBlock(props: {
  eyebrow: string;
  title: string;
  description: string;
  items: string[];
}) {
  return (
    <section
      style={{
        border: "1px solid var(--line)",
        borderRadius: 18,
        background: "rgba(255,255,255,0.74)",
        padding: 18,
        display: "grid",
        gap: 14,
        minWidth: 0,
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
          display: "grid",
          border: "1px solid var(--line)",
          borderRadius: 14,
          overflow: "hidden",
          background: "rgba(255,255,255,0.55)",
        }}
      >
        {props.items.map((item) => (
          <div
            key={item}
            style={{
              padding: "10px 12px",
              borderTop: "1px solid var(--line)",
              color: "var(--ink)",
              fontSize: 14,
              fontWeight: 750,
            }}
          >
            {item}
          </div>
        ))}
      </div>
    </section>
  );
}

export default function CommandCenterPage() {
  const access = useAccess();

  const name =
    access.display_name ||
    [access.first_name, access.last_name].filter(Boolean).join(" ") ||
    access.email ||
    "Platform Owner";

  return (
    <main className="workspace-shell">
      <SiteHeader />

      <section className="workspace-main" style={{ gap: 18 }}>
        <header style={{ display: "grid", gap: 6 }}>
          <p className="eyebrow">TeamOptix Platform</p>
          <h1
            className="workspace-title"
            style={{ fontSize: "clamp(2rem, 3.4vw, 3.25rem)", margin: 0 }}
          >
            Command Center
          </h1>
          <p className="workspace-subtitle">
            Platform Owner · {access.loading ? "Loading" : name}
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
          <CommandBlock
            eyebrow="Platform Overview"
            title="Operating Snapshot"
            description="The high-level read on Insight as a platform."
            items={[
              "Active companies",
              "Active users",
              "New companies",
              "Platform adoption",
            ]}
          />

          <CommandBlock
            eyebrow="Commercial Metrics"
            title="Revenue Snapshot"
            description="Commercial movement, subscription posture, and growth signals."
            items={[
              "Recurring revenue",
              "Revenue by tier",
              "Customer growth",
              "New subscriptions",
            ]}
          />

          <CommandBlock
            eyebrow="Platform Health"
            title="System Posture"
            description="Runtime, automation, collection, and infrastructure confidence."
            items={[
              "Runtime health",
              "Automation health",
              "Collection health",
              "Queue health",
            ]}
          />

          <CommandBlock
            eyebrow="Customer Intelligence"
            title="Company Watch"
            description="Company-level attention, adoption, support, and operational posture."
            items={[
              "Subscription tier",
              "Operational health",
              "Last activity",
              "Support status",
            ]}
          />

          <CommandBlock
            eyebrow="Platform Intelligence"
            title="Owner Observations"
            description="Insight-generated observations that help TeamOptix run the platform."
            items={[
              "Companies requiring attention",
              "Adoption opportunities",
              "Revenue trends",
              "Operational anomalies",
            ]}
          />

          <CommandBlock
            eyebrow="Build Surface"
            title="Next Platform Work"
            description="Reserved space for the next owner-layer build without borrowing customer-workspace language."
            items={[
              "Billing objects",
              "Payment service references",
              "Platform configuration",
              "Owner reporting",
            ]}
          />
        </section>
      </section>
    </main>
  );
}
