import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import TeamOptixShell from "@/features/teamoptix/navigation/TeamOptixShell";
import { WorkspaceHeader, WorkspaceSection } from "@/features/ui/workspace";
import {
  listCompanyOperationsTicketAssignments,
  listOperationsTicketTemplates,
  listTeamOptixCompanyOptions,
  type CompanyOperationsTicketAssignmentRow,
} from "@/features/teamoptix/automation/server/ticketControl.server";
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

  const { error } = await supabase.rpc("upsert_company_operations_ticket_assignment", {
    p_company_id: companyId,
    p_template_id: templateId,
    p_assignment_status: assignmentStatus,
    p_is_enabled: isEnabled,
    p_generation_mode: generationMode,
    p_cadence_minutes: cadenceMinutes,
    p_window_preset: windowPreset,
    p_start_time: readString(formData, "startTime") || null,
    p_end_time: readString(formData, "endTime") || null,
    p_priority_override: priorityOverride,
    p_route_scope: routeScope,
    p_route_limit: routeLimit,
    p_assignment_payload_json: {},
  });

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


function buildRunnerCollectionRequestPayloadPreview(assignment: CompanyOperationsTicketAssignmentRow) {
  return {
    rpc: "public.create_operations_collection_request",
    arguments: {
      p_company_slug: assignment.company_slug,
      p_request_type: "TARGETED_RECOVERY",
      p_service_date: "SERVICE_DATE_TO_APPROVE",
      p_service_date_start: null,
      p_service_date_end: null,
      p_requested_reports: ["FCC"],
      p_priority: assignment.effective_priority,
      p_request_payload: {
        source: "teamoptix_assignment_runner_payload",
        intent: "all_route_manifest_capture",
        collect_scope: "all_route_manifests",
        control_level: "platform_managed",
        runner_goal: "collect_delivery_pickup_manifests_for_all_p_and_d_work_areas",
        assignment_id: assignment.id,
        template_key: assignment.template_key,
        manifest_work_area_mode: "all_options_except_zero",
        manifest_types: ["delivery", "pickup"],
        skip_combined: true,
        targets: [
          {
            key: "P_AND_D_DELIVERY_MANIFEST",
            label: "P&D · Delivery Manifest",
            artifact_key: "DELIVERY_MANIFEST",
            report_family_key: "FCC",
            runner_section: "P_AND_D",
            expected_filename_match: ["DeliveryManifest"],
          },
          {
            key: "P_AND_D_PICKUP_MANIFEST",
            label: "P&D · Pickup Manifest",
            artifact_key: "PICKUP_MANIFEST",
            report_family_key: "FCC",
            runner_section: "P_AND_D",
            expected_filename_match: ["PickupManifest", "PM"],
          },
        ],
      },
    },
    runner_runtime_effect: {
      FCMS_TARGET_SECTIONS: "P_AND_D",
      FCMS_TARGET_ARTIFACT_KEYS: "DELIVERY_MANIFEST,PICKUP_MANIFEST",
      FCMS_MANIFEST_TYPES: "delivery,pickup",
      FCMS_SKIP_COMBINED: "1",
      p_and_d_behavior: "Loop all manifestForm:workAreas options except option 0; download Delivery and Pickup; skip Combined.",
    },
  };
}

async function queueAllRouteManifestCollection(formData: FormData) {
  "use server";

  const assignmentId = readString(formData, "assignmentId");
  const serviceDate = readString(formData, "serviceDate");

  if (!assignmentId) {
    throw new Error("Assignment is required.");
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)) {
    throw new Error("Service date is required.");
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
    throw new Error("Only Team Optix platform owners can queue manifest collections.");
  }

  const { data: assignment, error: assignmentError } = await supabase
    .from("company_operations_ticket_assignment_v")
    .select("*")
    .eq("id", assignmentId)
    .maybeSingle();

  if (assignmentError) {
    throw new Error(assignmentError.message);
  }

  if (!assignment) {
    throw new Error("Assignment not found.");
  }

  const preview = buildRunnerCollectionRequestPayloadPreview(assignment as CompanyOperationsTicketAssignmentRow);
  const args = preview.rpc === "public.create_operations_collection_request"
    ? preview.arguments
    : null;

  if (!args) {
    throw new Error("Unsupported payload preview.");
  }

  const { error } = await supabase.rpc("create_operations_collection_request", {
    p_company_slug: args.p_company_slug,
    p_request_type: args.p_request_type,
    p_service_date: serviceDate,
    p_service_date_start: null,
    p_service_date_end: null,
    p_requested_reports: args.p_requested_reports,
    p_priority: args.p_priority,
    p_request_payload: {
      ...args.p_request_payload,
      service_date: serviceDate,
      queued_from_assignment_id: assignmentId,
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/teamoptix/automation/assignments");
  redirect("/teamoptix/automation/assignments");
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

            {assignments.length > 0 ? (
              <WorkspaceSection
                eyebrow="Runner Payload"
                title="All-Route Manifest Collection"
                description="Queues the current VPS runner lane: all P&D work areas, Delivery + Pickup manifests, Combined skipped."
              >
                <div style={{ display: "grid", gap: 16 }}>
                  {assignments.map((assignment) => {
                    const preview = buildRunnerCollectionRequestPayloadPreview(assignment);

                    return (
                      <article className="app-card" key={`payload-${assignment.id}`} style={{ display: "grid", gap: 12, padding: 18 }}>
                        <div>
                          <h3 style={{ margin: 0 }}>{assignment.company_slug} · {assignment.template_name}</h3>
                          <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 13 }}>
                            Runner lane: operations_collection_request · P_AND_D · all dropdown work areas · Delivery/Pickup only.
                          </p>
                        </div>

                        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                          <div><strong>Request Type</strong><br />TARGETED_RECOVERY</div>
                          <div><strong>Runner Section</strong><br />P_AND_D</div>
                          <div><strong>Manifest Types</strong><br />delivery, pickup</div>
                          <div><strong>Skip Combined</strong><br />true</div>
                        </div>

                        <form action={queueAllRouteManifestCollection} style={{ alignItems: "end", display: "flex", flexWrap: "wrap", gap: 10 }}>
                          <input name="assignmentId" type="hidden" value={assignment.id} />
                          <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 800 }}>
                            Service Date
                            <input name="serviceDate" required type="date" />
                          </label>
                          <button className="primary-action" type="submit">
                            Queue All-Route Delivery + Pickup
                          </button>
                        </form>

                        <details style={{ border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
                          <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 800, padding: "10px 12px" }}>
                            View runner payload
                          </summary>
                          <pre
                            style={{
                              background: "#020617",
                              color: "#e2e8f0",
                              fontSize: 12,
                              lineHeight: 1.45,
                              margin: 0,
                              maxHeight: 420,
                              overflow: "auto",
                              padding: 14,
                              whiteSpace: "pre-wrap",
                            }}
                          >
                            {JSON.stringify(preview, null, 2)}
                          </pre>
                        </details>
                      </article>
                    );
                  })}
                </div>
              </WorkspaceSection>
            ) : null}
          </section>
        </section>
      </main>
    </TeamOptixShell>
  );
}
