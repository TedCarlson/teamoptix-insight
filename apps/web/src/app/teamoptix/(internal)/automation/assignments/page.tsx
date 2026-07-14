import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import TeamOptixShell from "@/features/teamoptix/navigation/TeamOptixShell";
import { WorkspaceHeader, WorkspaceSection } from "@/features/ui/workspace";
import {
  listCompanyOperationsTicketAssignments,
  listOperationsTicketTemplates,
  listTeamOptixCompanyOptions,
} from "@/features/teamoptix/automation/server/ticketControl.server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const ASSIGNMENT_STATUSES = ["draft", "ready", "active", "paused", "retired"];
const GENERATION_MODES = ["manual", "scheduled", "event_triggered"];
const WINDOW_PRESETS = ["OFF", "SORT_DELIVERY_DAY", "BUSINESS_DAY", "CUSTOM"];
const ROUTE_SCOPES = [
  "selected_routes",
  "active_routes",
  "full_active_route_set",
  "route_batch",
];

function readString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function readNullableInteger(formData: FormData, key: string) {
  const raw = readString(formData, key);

  if (!raw) {
    return null;
  }

  const value = Number(raw);

  if (!Number.isInteger(value)) {
    throw new Error(`${key} must be an integer.`);
  }

  return value;
}

function readAllowed(formData: FormData, key: string, allowed: string[]) {
  const value = readString(formData, key);

  if (!allowed.includes(value)) {
    throw new Error(`${key} is invalid.`);
  }

  return value;
}

async function upsertCompanyTicketAssignment(formData: FormData) {
  "use server";

  const companyId = readString(formData, "companyId");
  const templateId = readString(formData, "templateId");

  if (!companyId || !templateId) {
    throw new Error("Company and ticket template are required.");
  }

  const assignmentStatus = readAllowed(formData, "assignmentStatus", ASSIGNMENT_STATUSES);
  const generationMode = readAllowed(formData, "generationMode", GENERATION_MODES);
  const windowPreset = readAllowed(formData, "windowPreset", WINDOW_PRESETS);
  const routeScope = readAllowed(formData, "routeScope", ROUTE_SCOPES);
  const cadenceMinutes = readNullableInteger(formData, "cadenceMinutes");
  const priorityOverride = readNullableInteger(formData, "priorityOverride");
  const routeLimit = readNullableInteger(formData, "routeLimit");
  const isEnabled = formData.get("isEnabled") === "on";

  if (cadenceMinutes !== null && ![15, 30, 60].includes(cadenceMinutes)) {
    throw new Error("Cadence must be blank, 15, 30, or 60.");
  }

  if (priorityOverride !== null && (priorityOverride < 1 || priorityOverride > 999)) {
    throw new Error("Priority override must be between 1 and 999.");
  }

  if (routeLimit !== null && routeLimit < 1) {
    throw new Error("Route limit must be greater than zero.");
  }

  const supabase = await getSupabaseServerClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("Unauthorized.");
  }

  const { data: access, error: accessError } = await supabase.rpc("access_context");

  if (accessError) {
    throw new Error(accessError.message);
  }

  if (!access?.is_platform_owner) {
    throw new Error("Only Team Optix platform owners can edit ticket assignments.");
  }

  const db = createSupabaseServiceRoleClient();

  const { error } = await db
    .schema("core")
    .from("company_operations_ticket_assignment")
    .upsert(
      {
        company_id: companyId,
        template_id: templateId,
        assignment_status: assignmentStatus,
        is_enabled: isEnabled,
        generation_mode: generationMode,
        cadence_minutes: cadenceMinutes,
        window_preset: windowPreset,
        start_time: readString(formData, "startTime") || null,
        end_time: readString(formData, "endTime") || null,
        priority_override: priorityOverride,
        route_scope: routeScope,
        route_limit: routeLimit,
        assignment_payload_json: {},
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "company_id,template_id",
      }
    );

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/teamoptix/automation/assignments");
  redirect("/teamoptix/automation/assignments");
}

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
  const [assignments, templates, companies] = await Promise.all([
    listCompanyOperationsTicketAssignments(),
    listOperationsTicketTemplates(),
    listTeamOptixCompanyOptions(),
  ]);

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
              eyebrow="Assignment Editor"
              title="Create or Update Assignment"
              description="Bind a ticket template to a customer workspace. This only records Team Optix control settings; it does not generate tickets."
            >
              <form action={upsertCompanyTicketAssignment} className="app-card" style={{ display: "grid", gap: 14, padding: 18 }}>
                <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                  <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 800 }}>
                    Company
                    <select name="companyId" required>
                      <option value="">Select company</option>
                      {companies.map((company) => (
                        <option key={company.id} value={company.id}>
                          {company.company_name || company.company_slug}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 800 }}>
                    Ticket Template
                    <select name="templateId" required>
                      <option value="">Select template</option>
                      {templates.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.template_name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 800 }}>
                    Status
                    <select name="assignmentStatus" defaultValue="draft">
                      {ASSIGNMENT_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 800 }}>
                    Generation Mode
                    <select name="generationMode" defaultValue="manual">
                      {GENERATION_MODES.map((mode) => (
                        <option key={mode} value={mode}>
                          {mode}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 800 }}>
                    Window
                    <select name="windowPreset" defaultValue="OFF">
                      {WINDOW_PRESETS.map((preset) => (
                        <option key={preset} value={preset}>
                          {preset}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 800 }}>
                    Route Scope
                    <select name="routeScope" defaultValue="selected_routes">
                      {ROUTE_SCOPES.map((scope) => (
                        <option key={scope} value={scope}>
                          {scope}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 800 }}>
                    Cadence Minutes
                    <input name="cadenceMinutes" inputMode="numeric" placeholder="blank, 15, 30, or 60" />
                  </label>

                  <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 800 }}>
                    Priority Override
                    <input name="priorityOverride" inputMode="numeric" placeholder="blank or 1-999" />
                  </label>

                  <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 800 }}>
                    Route Limit
                    <input name="routeLimit" inputMode="numeric" placeholder="optional" />
                  </label>

                  <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 800 }}>
                    Start Time
                    <input name="startTime" type="time" />
                  </label>

                  <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 800 }}>
                    End Time
                    <input name="endTime" type="time" />
                  </label>

                  <label style={{ alignItems: "center", display: "flex", gap: 8, fontSize: 12, fontWeight: 800 }}>
                    <input name="isEnabled" type="checkbox" />
                    Enabled
                  </label>
                </div>

                <button className="primary-action" type="submit">
                  Save Assignment
                </button>
              </form>
            </WorkspaceSection>

            <WorkspaceSection
              eyebrow="Assignments"
              title={`${assignments.length} Company Assignment${assignments.length === 1 ? "" : "s"}`}
              description="Saved bindings. Ticket generation remains intentionally disconnected."
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
