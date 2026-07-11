import Link from "next/link";
import TeamOptixShell from "@/features/teamoptix/navigation/TeamOptixShell";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  WorkspaceHeader,
  WorkspaceSection,
} from "@/features/ui/workspace";

export const dynamic = "force-dynamic";

export default async function TeamOptixCustomersPage() {
  const supabase = await getSupabaseServerClient();

  const { data: companies, error } = await supabase
    .from("companies")
    .select("id, company_slug, company_name")
    .order("company_name", { ascending: true });

  const rows = companies ?? [];

  return (
    <TeamOptixShell>
      <main className="workspace-shell">
        <section className="workspace-main">
          <WorkspaceHeader
            eyebrow="TeamOptix · Customers"
            title="Customer Workspace"
            description="Select a customer to manage Team Optix-owned governance, operating scope, and platform automation."
          />

          <WorkspaceSection
            eyebrow="Customer Portfolio"
            title="Active customer workspaces"
            description="Customer records are loaded from the Team Optix company database."
          >
            {error ? (
              <p style={{ color: "#b91c1c", fontWeight: 800 }}>
                {error.message}
              </p>
            ) : rows.length === 0 ? (
              <p className="app-card__body">No customer companies found.</p>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                  gap: 12,
                }}
              >
                {rows.map((company) => (
                  <Link
                    key={company.id}
                    href={`/teamoptix/customers/${company.company_slug}`}
                    className="app-card"
                    style={{
                      display: "grid",
                      gap: 8,
                      padding: 18,
                      textDecoration: "none",
                      color: "inherit",
                    }}
                  >
                    <p className="value-card__eyebrow" style={{ margin: 0 }}>
                      Customer
                    </p>

                    <h3 className="app-card__title" style={{ margin: 0 }}>
                      {company.company_name || company.company_slug}
                    </h3>

                    <p className="app-card__body" style={{ margin: 0 }}>
                      Open contracts, terminal scope, collection controls, and
                      runtime posture.
                    </p>

                    <span
                      style={{
                        color: "#2563eb",
                        fontSize: 12,
                        fontWeight: 950,
                      }}
                    >
                      Open customer workspace →
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </WorkspaceSection>
        </section>
      </main>
    </TeamOptixShell>
  );
}
