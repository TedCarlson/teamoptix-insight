import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import TeamOptixShell from "@/features/teamoptix/navigation/TeamOptixShell";
import RemoveAssignmentButton from "@/features/teamoptix/automation/components/RemoveAssignmentButton";
import {
  listCompanyOperationsTicketAssignments,
  listOperationsTicketTemplates,
  listTeamOptixCompanyOptions,
} from "@/features/teamoptix/automation/server/ticketControl.server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const DAILY_PACKAGE_REQUEST_TYPES = new Set([
  "PREVIOUS_DAY_CLOSE",
  "DRO_AM",
  "OPERATIONS_PULSE",
]);

function text(fd: FormData, key: string) {
  return String(fd.get(key) ?? "").trim();
}

async function saveWorkOrderRule(formData: FormData) {
  "use server";

  const supabase = await getSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Unauthorized.");
  const { data: access, error: accessError } = await supabase.rpc("access_context");
  if (accessError) throw new Error(accessError.message);
  if (!access?.is_platform_owner) throw new Error("Only Team Optix platform owners can ship work orders.");

  const companyId = text(formData, "companyId");
  const templateId = text(formData, "templateId");
  if (!companyId || !templateId) {
    throw new Error("Company and ticket are required.");
  }
  const { data: template, error: templateError } = await supabase.from("operations_ticket_template_v").select("template_key,default_payload_json").eq("id", templateId).single();
  if (templateError || !template) throw new Error(templateError?.message || "Ticket not found.");
  const payload = (template.default_payload_json ?? {}) as Record<string, any>;
  const artifacts = (Array.isArray(payload.targets) ? payload.targets : []).map((target: any) => String(target?.artifact_key ?? "")).filter(Boolean);
  if (artifacts.length === 0) throw new Error("The selected ticket has no collection targets. Repair it in Automation Workbench first.");
  const requestType = String(payload.request_type ?? "OPERATIONS_PULSE");
  if (DAILY_PACKAGE_REQUEST_TYPES.has(requestType)) {
    throw new Error(
      "Prior Day, DRO AM, and Continuous Collection are controlled by the signed daily-package gate, not company ticket assignments."
    );
  }
  const operationalContract = requestType === "PREVIOUS_DAY_CLOSE" ? "PREVIOUS_DAY_FINAL" : requestType === "HISTORICAL_BACKFILL" ? "HISTORICAL_SWEEP" : requestType === "LAST_LOOK" ? "LAST_LOOK" : "IN_DAY_OPERATIONS";

  const cadenceRaw = text(formData, "cadenceMinutes");
  const releaseOrderRaw = text(formData, "releaseOrder");
  const generationMode = text(formData, "generationMode");
  const startTime = text(formData, "startTime") || null;
  const endTime = text(formData, "endTime") || null;
  const runDay = text(formData, "runDay") || null;
  const dynamicDateRange = text(formData, "dynamicDateRange") || null;
  const operatingWeekdays = formData.getAll("operatingWeekdays")
    .map((value) => Number(String(value)))
    .filter(Number.isInteger);
  const overrideDate = text(formData, "overrideDate") || null;
  const overrideMode = text(formData, "overrideMode") || null;

  const { error } = await supabase.rpc("upsert_company_operations_work_order_rule", {
    p_company_id: companyId,
    p_template_id: templateId,
    p_operational_contract: operationalContract,
    p_cook_key: "GENERAL_COOK",
    p_artifact_keys: artifacts,
    p_active_start_date: text(formData, "activeStartDate"),
    p_inactive_end_date: text(formData, "inactiveEndDate") || null,
    p_release_order: Number(releaseOrderRaw || 100),
    p_operator_notes: text(formData, "operatorNotes") || null,
    p_assignment_status: "active",
    p_is_enabled: true,
    p_generation_mode: generationMode,
    p_cadence_minutes: requestType === "HISTORICAL_BACKFILL" ? null : cadenceRaw ? Number(cadenceRaw) : null,
    p_window_preset: generationMode === "scheduled" ? "CUSTOM" : "OFF",
    p_start_time: startTime,
    p_end_time: requestType === "HISTORICAL_BACKFILL" ? null : endTime,
    p_route_scope: text(formData, "routeScope") || "full_active_route_set",
    p_assignment_payload_json: {
      ...payload,
      authored_from: "teamoptix_ticket_terminal",
      operational_contract: operationalContract,
      request_type: requestType,
      date_mode: payload.date_mode ?? null,
      artifact_keys: artifacts,
      schedule_days: generationMode === "scheduled" && runDay ? [Number(runDay)] : [],
      operating_weekdays: requestType === "OPERATIONS_PULSE" ? operatingWeekdays : [],
      operating_date_overrides:
        requestType === "OPERATIONS_PULSE" && overrideDate && overrideMode
          ? { [overrideDate]: overrideMode }
          : {},
      dynamic_date_range: requestType === "HISTORICAL_BACKFILL" ? dynamicDateRange : null,
    },
  });
  if (error) throw new Error(error.message);

  revalidatePath("/teamoptix/automation/assignments");
  redirect("/teamoptix/automation/assignments");
}

async function removeWorkOrderRule(formData: FormData) {
  "use server";
  const assignmentId = text(formData, "assignmentId");
  if (!assignmentId) throw new Error("Assignment is required.");
  const supabase = await getSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Unauthorized.");
  const { error } = await supabase.rpc("delete_company_operations_ticket_assignment", {
    p_assignment_id: assignmentId,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/teamoptix/automation/assignments");
  revalidatePath("/teamoptix/automation");
  redirect("/teamoptix/automation/assignments");
}

async function setWorkOrderState(formData: FormData) {
  "use server";

  const assignmentId = text(formData, "assignmentId");
  const desiredState = text(formData, "desiredState");
  if (!assignmentId || !["active", "paused"].includes(desiredState)) {
    throw new Error("A valid assignment and state are required.");
  }

  const supabase = await getSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Unauthorized.");
  const { data: access, error: accessError } = await supabase.rpc("access_context");
  if (accessError) throw new Error(accessError.message);
  if (!access?.is_platform_owner) {
    throw new Error("Only Team Optix platform owners can control assignments.");
  }

  const { data: assignment, error: assignmentError } = await supabase
    .from("company_operations_ticket_assignment_v")
    .select("inactive_end_date")
    .eq("id", assignmentId)
    .single();
  if (assignmentError || !assignment) {
    throw new Error(assignmentError?.message || "Assignment not found.");
  }

  const { error } = await supabase.rpc("update_company_operations_work_order_rule", {
    p_assignment_id: assignmentId,
    p_assignment_status: desiredState,
    p_is_enabled: desiredState === "active",
    p_inactive_end_date: assignment.inactive_end_date,
    p_release_order: null,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/teamoptix/automation/assignments");
  revalidatePath("/teamoptix/automation");
  redirect("/teamoptix/automation/assignments");
}

function label(value: string) {
  return value.toLowerCase().split("_").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ");
}

function scheduleText(row: any) {
  if (row.operational_contract === "IN_DAY_OPERATIONS") {
    return "Legacy binding · daily package is runner-controlled";
  }
  if (row.generation_mode === "manual") return "Ship on demand";
  if (row.generation_mode === "event_triggered") return "Event triggered";
  const payload = row.assignment_payload_json ?? {};
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const scheduledDay = Array.isArray(payload.schedule_days) && payload.schedule_days.length ? days[Number(payload.schedule_days[0])] : null;
  const cadence = scheduledDay ? `Every ${scheduledDay}` : row.cadence_minutes ? `Every ${row.cadence_minutes} min` : "Scheduled";
  return row.start_time && row.end_time ? `${cadence} · ${row.start_time.slice(0, 5)}–${row.end_time.slice(0, 5)}` : cadence;
}

export default async function Page() {
  const [rows, templates, companies] = await Promise.all([
    listCompanyOperationsTicketAssignments(),
    listOperationsTicketTemplates(),
    listTeamOptixCompanyOptions(),
  ]);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <TeamOptixShell>
      <main className="workspace-shell">
        <section className="workspace-main">
          <header className="automation-domain-header"><span className="workspace-eyebrow">TeamOptix · Automation</span><h1>Company Assignments</h1><p>Bind published work instructions to customer companies and govern when each instruction operates.</p></header>

          <div className="assignment-workspace-stack">
            <section className="assignment-editor">
              <div className="automation-workbench-heading"><div><span className="workspace-eyebrow">Assignment editor</span><h2>Assign a published ticket</h2><p>The ticket governs what the runner collects. This assignment governs where and when it runs.</p></div></div>
              <form action={saveWorkOrderRule} className="assignment-form">
                <div className="assignment-form-grid assignment-form-grid--identity">
                  <label><span>Company</span>
                    <select name="companyId" required defaultValue="">
                      <option value="" disabled>Select company</option>
                      {companies.map((company) => <option key={company.id} value={company.id}>{company.company_name || company.company_slug} · {company.timezone || "Timezone not configured"}</option>)}
                    </select>
                    <small>Execution uses the company terminal’s configured timezone.</small>
                  </label>

                  <label><span>Published instruction</span>
                    <select name="templateId" required defaultValue="">
                      <option value="" disabled>Select instruction</option>
                      {templates
                        .filter((item) => {
                          const requestType = String(
                            item.default_payload_json?.request_type ?? ""
                          );
                          return item.is_active && !DAILY_PACKAGE_REQUEST_TYPES.has(requestType);
                        })
                        .map((item) => <option key={item.id} value={item.id}>{item.template_name}</option>)}
                    </select>
                    <small>Collection targets, date authority, and failure behavior come from this published ticket.</small>
                  </label>
                </div>

                <div className="assignment-control-group"><div><span className="workspace-eyebrow">Timing</span><h3>When should it operate?</h3></div><div className="assignment-form-grid">
                  <label><span>Trigger</span>
                    <select name="generationMode" defaultValue="scheduled">
                      <option value="scheduled">Run on a schedule</option>
                      <option value="manual">Run only on demand</option>
                      <option value="event_triggered">Run after a governed event</option>
                    </select>
                  </label>
                  <label><span>Frequency within the window</span>
                    <select name="cadenceMinutes" defaultValue="15">
                      <option value="">Run once at the start time</option>
                      <option value="5">Every 5 minutes</option>
                      <option value="10">Every 10 minutes</option>
                      <option value="15">Every 15 minutes</option>
                      <option value="20">Every 20 minutes</option>
                      <option value="30">Every 30 minutes</option>
                      <option value="45">Every 45 minutes</option>
                      <option value="60">Every 60 minutes</option>
                      <option value="90">Every 90 minutes</option>
                      <option value="120">Every 2 hours</option>
                      <option value="180">Every 3 hours</option>
                      <option value="240">Every 4 hours</option>
                    </select>
                    <small>The scheduler checks every minute. If a prior company run is still active, the next request waits for the governed restart opportunity.</small>
                  </label>
                  <label><span>Window begins</span><input name="startTime" type="time" /><small>Company terminal time.</small></label>
                  <label><span>Window ends</span><input name="endTime" type="time" /><small>Leave empty for a one-time scheduled run.</small></label>
                  <label><span>Day of week</span>
                    <select name="runDay" defaultValue="">
                      <option value="">Every operating day</option>
                      <option value="0">Sunday</option><option value="1">Monday</option><option value="2">Tuesday</option><option value="3">Wednesday</option><option value="4">Thursday</option><option value="5">Friday</option><option value="6">Saturday</option>
                    </select>
                    <small>Use for a weekly instruction such as Historical Sweep.</small>
                  </label>
                  <label><span>Dynamic historical period</span>
                    <select name="dynamicDateRange" defaultValue="">
                      <option value="">Use the ticket’s fixed period</option>
                      <option value="PREVIOUS_SATURDAY_THROUGH_FRIDAY">Previous Saturday through Friday</option>
                    </select>
                    <small>The dates are resolved when each run is generated.</small>
                  </label>
                </div></div>

                <div className="assignment-control-group"><div><span className="workspace-eyebrow">Operating calendar</span><h3>Which days can in-day collection run?</h3><p>Used only by Continuous Collection. Dated exceptions override the weekly pattern.</p></div>
                  <div className="assignment-weekday-grid">
                    {[{ value: "0", label: "Sun", checked: false }, { value: "1", label: "Mon", checked: true }, { value: "2", label: "Tue", checked: true }, { value: "3", label: "Wed", checked: true }, { value: "4", label: "Thu", checked: true }, { value: "5", label: "Fri", checked: true }, { value: "6", label: "Sat", checked: true }].map((day) => (
                      <label key={day.value} className="assignment-enable"><input name="operatingWeekdays" type="checkbox" value={day.value} defaultChecked={day.checked} /> <span>{day.label}</span></label>
                    ))}
                  </div>
                  <div className="assignment-form-grid">
                    <label><span>Optional exception date</span><input name="overrideDate" type="date" /><small>Use for a holiday closure or a one-off operating day.</small></label>
                    <label><span>Exception behavior</span><select name="overrideMode" defaultValue=""><option value="">No exception</option><option value="OPERATING">Run on this date</option><option value="CLOSED">Do not run on this date</option></select></label>
                  </div>
                </div>

                <input name="routeScope" type="hidden" value="full_active_route_set" />
                <input name="releaseOrder" type="hidden" value="100" />
                <div className="assignment-control-group"><div><span className="workspace-eyebrow">Lifecycle</span><h3>When is this assignment valid?</h3></div><div className="assignment-form-grid">
                  <label><span>Effective date</span><input name="activeStartDate" type="date" defaultValue={today} required /></label>
                  <label><span>Optional end date</span><input name="inactiveEndDate" type="date" /><small>Leave open to continue indefinitely.</small></label>
                  <div className="assignment-preview">
                    <span className="workspace-eyebrow">Activation</span>
                    <p>Saving activates this published instruction. Pause it later from the standing assignment when collection should stop.</p>
                  </div>
                </div></div>

                <label className="assignment-notes"><span>Assignment notes</span><textarea name="operatorNotes" rows={2} placeholder="Why this company receives the instruction or what changed." /></label>
                <div className="assignment-preview"><span className="workspace-eyebrow">Assignment boundary</span><p>The published ticket controls collection meaning and runner targets. This record controls the company, timing, and activation state. The ingestion engine remains authoritative for dates found inside collected files.</p></div>
                <button className="primary-action" type="submit">Save Company Assignment</button>
              </form>
            </section>

            <section className="assignment-library"><div className="automation-workbench-heading"><div><span className="workspace-eyebrow">Standing assignments</span><h2>{rows.length} company binding{rows.length === 1 ? "" : "s"}</h2><p>Published instructions currently associated with customer operating environments.</p></div></div>
              <div className="assignment-record-list">
                {rows.length === 0
                  ? <div className="automation-library-empty">No company assignments yet.</div>
                  : rows.map((row: any) => {
                    const companyName = row.company_name || row.company_slug;
                    const isActive = row.assignment_status === "active" && row.is_enabled;
                    return (
                      <article className="assignment-record" key={row.id}>
                        <div>
                          <span className={`automation-ticket-state ${isActive ? "is-published" : ""}`}>
                            {isActive ? "Enabled" : "Paused"}
                          </span>
                          <h3>{companyName}</h3>
                          <p>{row.template_name}</p>
                        </div>
                        <dl>
                          <div><dt>Timing</dt><dd>{scheduleText(row)}</dd></div>
                          <div><dt>Effective</dt><dd>{row.active_start_date || "—"} → {row.inactive_end_date || "Open"}</dd></div>
                          <div><dt>Collection</dt><dd>{Array.isArray(row.artifact_keys) && row.artifact_keys.length ? row.artifact_keys.map(label).join(" · ") : "Ticket defaults"}</dd></div>
                          <div><dt>Status</dt><dd>{isActive ? "Active · Automatic" : "Paused · No new requests"}</dd></div>
                        </dl>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                          <form action={setWorkOrderState}>
                            <input name="assignmentId" type="hidden" value={row.id} />
                            <input name="desiredState" type="hidden" value={isActive ? "paused" : "active"} />
                            <button className={isActive ? "assignment-remove-action" : "primary-action"} type="submit">
                              {isActive ? "Pause assignment" : "Activate assignment"}
                            </button>
                          </form>
                          <RemoveAssignmentButton
                            assignmentId={row.id}
                            companyName={companyName}
                            ticketName={row.template_name}
                            action={removeWorkOrderRule}
                          />
                        </div>
                      </article>
                    );
                  })}
              </div>
            </section>
          </div>
        </section>
      </main>
    </TeamOptixShell>
  );
}
