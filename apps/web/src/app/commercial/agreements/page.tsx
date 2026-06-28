import Link from "next/link";
import SiteHeader from "@/features/landing/components/SiteHeader";

const sections = [
  "1. Parties",
  "2. Definitions",
  "3. Subscription Grant",
  "4. Customer Responsibilities",
  "5. TeamOptix Responsibilities",
  "6. Services Provided",
  "7. Platform Availability",
  "8. Fees & Billing",
  "9. Trials",
  "10. Renewals & Cancellation",
  "11. Payment Terms",
  "12. Intellectual Property",
  "13. Confidentiality",
  "14. Customer Data",
  "15. Security",
  "16. AI Features",
  "17. Third-Party Services",
  "18. Warranty Disclaimer",
  "19. Limitation of Liability",
  "20. Governing Law",
  "21. General Provisions",
  "22. Document Governance",
];

export default function AgreementsPage() {
  return (
    <main className="workspace-shell">
      <SiteHeader />

      <section className="workspace-main">

        <header className="directory-header">
          <div>
            <p className="eyebrow">Commercial</p>
            <h1 className="directory-title">Agreement Workspace</h1>

            <p className="directory-subtitle">
              Build, version, publish and govern every commercial document used by Insight.
            </p>
          </div>

          <Link className="button" href="/commercial">
            Back to Commercial
          </Link>
        </header>

        <div className="directory-card" style={{padding:0}}>

          <div
            style={{
              display:"grid",
              gridTemplateColumns:"320px 120px 140px 120px",
              fontWeight:700,
              padding:"18px 24px",
              borderBottom:"1px solid var(--border)"
            }}
          >
            <div>Section</div>
            <div>Status</div>
            <div>Version</div>
            <div></div>
          </div>

          {sections.map((section,index)=>{

            const slug =
              section
                .toLowerCase()
                .replace(/\./g,"")
                .replace(/&/g,"and")
                .replace(/[^a-z0-9]+/g,"-")
                .replace(/^-|-$/g,"");

            return (

              <div
                key={section}
                style={{
                  display:"grid",
                  gridTemplateColumns:"320px 120px 140px 120px",
                  alignItems:"center",
                  padding:"18px 24px",
                  borderBottom:index===sections.length-1
                    ? "none"
                    : "1px solid var(--border)"
                }}
              >
                <div>{section}</div>

                <div>Draft</div>

                <div>0.1</div>

                <Link
                  href={`/commercial/agreements/master-service-agreement/${slug}`}
                >
                  Open →
                </Link>

              </div>

            );

          })}

        </div>

      </section>
    </main>
  );
}
