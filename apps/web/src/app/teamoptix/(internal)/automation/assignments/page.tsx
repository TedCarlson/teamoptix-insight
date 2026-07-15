import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import TeamOptixShell from "@/features/teamoptix/navigation/TeamOptixShell";
import { WorkspaceHeader, WorkspaceSection } from "@/features/ui/workspace";
import {
  listCompanyOperationsTicketAssignments,
  listOperationsTicketTemplates,
  listTeamOptixCompanyOptions,
} from "@/features/teamoptix/automation/server/ticketControl.server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const CONTRACTS = [
  ["IN_DAY_OPERATIONS", "In-Day Operations"],
  ["PREVIOUS_DAY_FINAL", "Previous-Day Final"],
  ["LAST_LOOK", "Last Look"],
  ["HISTORICAL_SWEEP", "Historical Sweep"],
  ["TARGETED_COLLECTION", "Targeted Collection"],
] as const;

const COOKS = [
  ["GENERAL_COOK", "General Cook · current VPS runner"],
  ["IN_DAY_REPORT_COOK", "In-Day Report Cook · DSW + FCC"],
  ["IN_DAY_MANIFEST_COOK", "In-Day Manifest Cook"],
  ["CATERING_COOK", "Catering Cook · sweeps + targeted"],
] as const;

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
  const operationalContract = text(formData, "operationalContract");
  const cookKey = text(formData, "cookKey");
  if (!companyId || !templateId || !operationalContract || !cookKey) {
    throw new Error("Company, work order, contract, and cook are required.");
  }

  const artifacts = ["DSW", "FCC", "DELIVERY_MANIFEST", "PICKUP_MANIFEST"]
    .filter((key) => formData.get(`artifact_${key}`) === "on");
  if (artifacts.length === 0) throw new Error("Select at least one collection item.");

  const cadenceRaw = text(formData, "cadenceMinutes");
  const releaseOrderRaw = text(formData, "releaseOrder");
  const generationMode = text(formData, "generationMode");
  const startTime = text(formData, "startTime") || null;
  const endTime = text(formData, "endTime") || null;

  const { error } = await supabase.rpc("upsert_company_operations_work_order_rule", {
    p_company_id: companyId,
    p_template_id: templateId,
    p_operational_contract: operationalContract,
    p_cook_key: cookKey,
    p_artifact_keys: artifacts,
    p_active_start_date: text(formData, "activeStartDate"),
    p_inactive_end_date: text(formData, "inactiveEndDate") || null,
    p_release_order: Number(releaseOrderRaw || 100),
    p_operator_notes: text(formData, "operatorNotes") || null,
    p_assignment_status: text(formData, "assignmentStatus") || "draft",
    p_is_enabled: formData.get("isEnabled") === "on",
    p_generation_mode: generationMode,
    p_cadence_minutes: cadenceRaw ? Number(cadenceRaw) : null,
    p_window_preset: generationMode === "scheduled" ? "CUSTOM" : "OFF",
    p_start_time: startTime,
    p_end_time: endTime,
    p_route_scope: text(formData, "routeScope") || "full_active_route_set",
    p_assignment_payload_json: {
      authored_from: "teamoptix_ticket_terminal",
      operational_contract: operationalContract,
      cook_key: cookKey,
      artifact_keys: artifacts,
    },
  });
  if (error) throw new Error(error.message);

  revalidatePath("/teamoptix/automation/assignments");
  redirect("/teamoptix/automation/assignments");
}

function label(value: string) {
  return value.toLowerCase().split("_").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ");
}

function scheduleText(row: any) {
  if (row.generation_mode === "manual") return "Ship on demand";
  if (row.generation_mode === "event_triggered") return "Event triggered";
  const cadence = row.cadence_minutes ? `Every ${row.cadence_minutes} min` : "Scheduled";
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
          <WorkspaceHeader
            eyebrow="Team Optix · Automation Control Center"
            title="Ticket Terminal"
            description="Author the standing work orders each company places with the VPS kitchen. The database carries the order; the current General Cook executes every work order."
          />

          <section className="teamoptix-console">
            <WorkspaceSection
              eyebrow="Authoring"
              title="Prepare and Ship a Work Order"
              description="Choose the company table, the operational contract, and the cook. The terminal writes the machine language behind the scenes."
            >
              <form action={saveWorkOrderRule} className="app-card" style={{ display: "grid", gap: 18, padding: 18 }}>
                <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                  <label style={{ display: "grid", gap: 6, fontWeight: 800, fontSize: 12 }}>
                    Company Table
                    <select name="companyId" required defaultValue="">
                      <option value="" disabled>Select company</option>
                      {companies.map((company) => <option key={company.id} value={company.id}>{company.company_name || company.company_slug}</option>)}
                    </select>
                    <small>The customer whose standing order receives this row.</small>
                  </label>

                  <label style={{ display: "grid", gap: 6, fontWeight: 800, fontSize: 12 }}>
                    Work Order Definition
                    <select name="templateId" required defaultValue="">
                      <option value="" disabled>Select work order</option>
                      {templates.filter((item) => item.is_active).map((item) => <option key={item.id} value={item.id}>{item.template_name}</option>)}
                    </select>
                    <small>The proven runner recipe used to compile the ticket.</small>
                  </label>

                  <label style={{ display: "grid", gap: 6, fontWeight: 800, fontSize: 12 }}>
                    Operational Contract
                    <select name="operationalContract" defaultValue="IN_DAY_OPERATIONS">
                      {CONTRACTS.map(([value, title]) => <option key={value} value={value}>{title}</option>)}
                    </select>
                    <small>Why this standing order exists.</small>
                  </label>

                  <label style={{ display: "grid", gap: 6, fontWeight: 800, fontSize: 12 }}>
                    Send to Cook
                    <select name="cookKey" defaultValue="GENERAL_COOK">
                      {COOKS.map(([value, title]) => <option key={value} value={value}>{title}</option>)}
                    </select>
                    <small>All choices currently route to the same General Cook.</small>
                  </label>
                </div>

                <div className="app-card" style={{ padding: 14 }}>
                  <strong style={{ display: "block", marginBottom: 10 }}>What goes on the order?</strong>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
                    {["DSW", "FCC", "DELIVERY_MANIFEST", "PICKUP_MANIFEST"].map((key) => (
                      <label key={key} style={{ display: "flex", alignItems: "center", gap: 7, fontWeight: 750 }}>
                        <input type="checkbox" name={`artifact_${key}`} defaultChecked={key.includes("MANIFEST")} />
                        {label(key)}
                      </label>
                    ))}
                  </div>
                </div>

                <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                  <label style={{ display: "grid", gap: 6, fontWeight: 800, fontSize: 12 }}>Order Behavior
                    <select name="generationMode" defaultValue="scheduled">
                      <option value="scheduled">Standing schedule</option>
                      <option value="manual">Ship on demand</option>
                      <option value="event_triggered">Event triggered</option>
                    </select>
                  </label>
                  <label style={{ display: "grid", gap: 6, fontWeight: 800, fontSize: 12 }}>Cadence
                    <select name="cadenceMinutes" defaultValue="15">
                      <option value="">One run at scheduled time</option>
                      <option value="15">Every 15 minutes</option>
                      <option value="30">Every 30 minutes</option>
                      <option value="60">Every 60 minutes</option>
                    </select>
                  </label>
                  <label style={{ display: "grid", gap: 6, fontWeight: 800, fontSize: 12 }}>Window Starts<input name="startTime" type="time" /></label>
                  <label style={{ display: "grid", gap: 6, fontWeight: 800, fontSize: 12 }}>Window Ends<input name="endTime" type="time" /></label>
                  <label style={{ display: "grid", gap: 6, fontWeight: 800, fontSize: 12 }}>Route Scope
                    <select name="routeScope" defaultValue="full_active_route_set">
                      <option value="full_active_route_set">All active routes</option>
                      <option value="active_routes">Current active routes</option>
                      <option value="selected_routes">Selected routes</option>
                      <option value="route_batch">Route batch</option>
                    </select>
                  </label>
                  <label style={{ display: "grid", gap: 6, fontWeight: 800, fontSize: 12 }}>Release Order<input name="releaseOrder" type="number" min="1" defaultValue="1" /></label>
                  <label style={{ display: "grid", gap: 6, fontWeight: 800, fontSize: 12 }}>Active Start Date<input name="activeStartDate" type="date" defaultValue={today} required /></label>
                  <label style={{ display: "grid", gap: 6, fontWeight: 800, fontSize: 12 }}>Inactive End Date<input name="inactiveEndDate" type="date" /><small>Leave open to keep honoring this recipe.</small></label>
                  <label style={{ display: "grid", gap: 6, fontWeight: 800, fontSize: 12 }}>Status
                    <select name="assignmentStatus" defaultValue="draft">
                      <option value="draft">Draft</option><option value="ready">Ready</option><option value="active">Active</option><option value="paused">Paused</option><option value="retired">Retired</option>
                    </select>
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 800, fontSize: 12, paddingTop: 24 }}><input name="isEnabled" type="checkbox" />Automation enabled</label>
                </div>

                <label style={{ display: "grid", gap: 6, fontWeight: 800, fontSize: 12 }}>Operator Notes<textarea name="operatorNotes" rows={2} placeholder="Why this order exists or what changed." /></label>
                <button className="primary-action" type="submit">Ship Work Order to Company Table</button>
              </form>
            </WorkspaceSection>

            <WorkspaceSection
              eyebrow="Company Tables"
              title="Standing Work Orders"
              description="Rows are evaluated in release order. Open-ended rows remain the active recipe until paused, retired, or given an inactive end date."
            >
              <div className="operations-table-wrap">
                <table className="operations-table">
                  <thead><tr><th>Order</th><th>Company</th><th>Contract</th><th>Cook</th><th>Collection</th><th>Timing</th><th>Effective</th><th>Status</th></tr></thead>
                  <tbody>
                    {rows.length === 0 ? <tr><td colSpan={8}>No standing work orders yet.</td></tr> : rows.map((row: any) => (
                      <tr key={row.id}>
                        <td><strong>{row.release_order ?? 100}</strong></td>
                        <td><strong>{row.company_name || row.company_slug}</strong><br /><span>{row.template_name}</span></td>
                        <td>{label(row.operational_contract || "IN_DAY_OPERATIONS")}</td>
                        <td>{label(row.cook_key || "GENERAL_COOK")}</td>
                        <td>{Array.isArray(row.artifact_keys) && row.artifact_keys.length ? row.artifact_keys.map(label).join(" · ") : "Recipe defaults"}</td>
                        <td>{scheduleText(row)}</td>
                        <td>{row.active_start_date || "—"} → {row.inactive_end_date || "Open"}</td>
                        <td>{row.assignment_status}{row.is_enabled ? " · enabled" : ""}</td>
                      </tr>
                    ))}
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
