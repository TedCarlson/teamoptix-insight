import TeamOptixShell from "@/features/teamoptix/navigation/TeamOptixShell";
import { WorkspaceHeader, WorkspaceSection } from "@/features/ui/workspace";
import { listOperationsTicketTemplates } from "@/features/teamoptix/automation/server/ticketControl.server";

function formatManifestTypes(values: string[] | null) {
  if (!values || values.length === 0) return "—";
  return values.join(", ");
}

export default async function Page() {
  const templates = await listOperationsTicketTemplates();

  return (
    <TeamOptixShell>
      <main className="workspace-shell">
        <section className="workspace-main">
          <WorkspaceHeader
            eyebrow="TeamOptix · Automation"
            title="Ticket Library"
            description="Reusable Team Optix ticket templates that define what the platform is allowed to generate for downstream execution lanes."
          />

          <section className="teamoptix-console">
            <WorkspaceSection
              eyebrow="Library"
              title={`${templates.length} Ticket Template${templates.length === 1 ? "" : "s"}`}
              description="Read-only foundation. Template editing and assignment generation come in later passes."
            >
              <div className="operations-table-wrap">
                <table className="operations-table">
                  <thead>
                    <tr>
                      <th>Template</th>
                      <th>Family</th>
                      <th>Execution Lane</th>
                      <th>Priority</th>
                      <th>Manifest Types</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {templates.length === 0 ? (
                      <tr>
                        <td colSpan={6}>No ticket templates found.</td>
                      </tr>
                    ) : (
                      templates.map((template) => (
                        <tr key={template.id}>
                          <td>
                            <strong>{template.template_name}</strong>
                            <br />
                            <span>{template.template_key}</span>
                          </td>
                          <td>{template.ticket_family}</td>
                          <td>{template.execution_lane}</td>
                          <td>{template.default_priority}</td>
                          <td>{formatManifestTypes(template.default_manifest_types)}</td>
                          <td>{template.is_active ? "Active" : "Inactive"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </WorkspaceSection>
          </section>
        </section>
      </main>
    </TeamOptixShell>
  );
}
