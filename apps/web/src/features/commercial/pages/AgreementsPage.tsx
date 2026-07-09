import Link from "next/link";
import PlatformPillarCard from "@/features/platform/components/PlatformPillarCard";
import TeamOptixShell from "@/features/teamoptix/navigation/TeamOptixShell";

const agreements = [
  {
    href: "/teamoptix/business/contracts/documents/master-service-agreement",
    eyebrow: "Agreement",
    title: "Master Service Agreement",
    body: "Draft v0.1 governing the commercial relationship for Insight customers.",
  },
  {
    href: null,
    eyebrow: "Addendum",
    title: "Statement of Work",
    body: "Planned customer-specific scope, service terms, and implementation details.",
  },
  {
    href: null,
    eyebrow: "Addendum",
    title: "Data Processing Addendum",
    body: "Planned processing, retention, deletion, and data handling terms.",
  },
  {
    href: null,
    eyebrow: "Policy",
    title: "Acceptable Use Policy",
    body: "Planned rules governing authorized use of the Insight platform.",
  },
];

export default function AgreementsPage() {
  return (
    <TeamOptixShell>
      <main className="workspace-shell">
        <section className="workspace-main">
        <header className="directory-header">
          <div>
            <p className="eyebrow">Commercial</p>
            <h1 className="directory-title">Agreement Workspace</h1>
            <p className="directory-subtitle">
              Build, version, publish, and govern every commercial document used by Insight.
            </p>
          </div>

          <Link className="button" href="/teamoptix/business/contracts">
            Back to Contracts
          </Link>
        </header>

        <section className="workspace-grid">
          {agreements.map((agreement) => {
            const card = (
              <PlatformPillarCard
                eyebrow={agreement.eyebrow}
                title={agreement.title}
                body={agreement.body}
              />
            );

            if (!agreement.href) return <div key={agreement.title}>{card}</div>;

            return (
              <Link
                key={agreement.title}
                href={agreement.href}
                style={{ textDecoration: "none", color: "inherit" }}
              >
                {card}
              </Link>
            );
          })}
        </section>
        </section>
      </main>
    </TeamOptixShell>
  );
}
