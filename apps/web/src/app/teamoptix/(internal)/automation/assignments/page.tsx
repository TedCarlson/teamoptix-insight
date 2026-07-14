import TeamOptixShell from "@/features/teamoptix/navigation/TeamOptixShell";
import { WorkspaceHeader, WorkspaceSection } from "@/features/ui/workspace";
import { listCompanyOperationsTicketAssignments } from "@/features/teamoptix/automation/server/ticketControl.server";

function formatSchedule(row: {
  generation_mode: string;
  cadence_minutes: number | null;
  window_preset: string;
  start_time: string | null;
  end_time: string | null;
}) {
  if (row.generation_mode === "manual") return "Manual";
  const cadence = row.cadence_minutes ? `${row.cadence_minutes} min` : "No cadence";
  const window =
    row.start_time && row.end_time
      ? `${row.window_preset} · ${row.start_time}–${row.end_time}`
      : row.window_preset;

  return `${cadence} · ${window}`;
}

export default async function Page() {
  const assignments = await listCompanyOperationsTicketAssignments();

  return (
    <TeamOptixShell>
      <main className="workspace-shell">
        <section className="workspace-main">
          <WorkspaceHeader
            eyebrow="TeamOptix · Automation"
            title="Company Assignments"
            description="Customer-specific bindings between Team Optix ticket templates, schedules, route scopes, priorities, and automation parameters."
          />

          <section className="teamoptix-console">
            <WorkspaceSection
              eyebrow="Assignments"
              title={`${assignments.length} Company Assignment${assignments.length === 1 ? "" : "s"}`}
              description="Read-only foundation. Assignment creation and controlled ticket generation come in later passes."
            >
              <div className="operations-table-wrap">
                <table className="operations-table">
                  <thead>
                    <tr>
                      <th>Company</th>
                      <th>Template</th>
                      <th>Status</th>
                      <th>Mode</th>
                      <th>Schedule</th>
                      <th>Route Scope</th>
                      <th>Priority</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignments.length === 0 ? (
                      <tr>
                        <td colSpan={7}>No company ticket assignments found.</td>
                      </tr>
                    ) : (
                      assignments.map((assignment) => (
                        <tr key={assignment.id}>
                          <td>{assignment.company_slug}</td>
                          <td>
                            <strong>{assignment.template_name}</strong>
                            <br />
                            <span>{assignment.template_key}</span>
                          </td>
                          <td>{assignment.is_enabled ? assignment.assignment_status : "disabled"}</td>
                          <td>{assignment.generation_mode}</td>
                          <td>{formatSchedule(assignment)}</td>
                          <td>
                            {assignment.route_scope}
                            {assignment.route_limit ? ` · limit ${assignment.route_limit}` : ""}
                          </td>
                          <td>{assignment.effective_priority}</td>
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
