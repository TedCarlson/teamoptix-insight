import { revalidatePath } from "next/cache";
import Link from "next/link";
import TeamOptixShell from "@/features/teamoptix/navigation/TeamOptixShell";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type SwitchboardRecord = {
  id: string;
  library_key: string;
  display_name: string;
  source_schema: string;
  source_object: string;
  object_type: string;
  status: "DISCOVERED" | "DEFINED" | "IMPLEMENTED" | "ACTIVE" | "RETIRED";
  source: "LEGACY" | "PLATFORM";
  notes: string | null;
  discovered_at: string;
  updated_at: string;
};

async function updateSwitchboardRecord(formData: FormData) {
  "use server";

  const db = await getSupabaseServerClient();

  const { error } = await db.rpc("update_platform_switchboard_record", {
    p_id: String(formData.get("id") ?? ""),
    p_status: String(formData.get("status") ?? "DISCOVERED"),
    p_source: String(formData.get("source") ?? "LEGACY"),
    p_notes: String(formData.get("notes") ?? ""),
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/teamoptix/platform");
}

export default async function Page() {
  const db = await getSupabaseServerClient();

  const { data, error } = await db.rpc("get_platform_switchboard");

  if (error) {
    throw new Error(error.message);
  }

  const records = (data ?? []) as SwitchboardRecord[];

  const schemaCount = new Set(
    records.map((record) => record.source_schema),
  ).size;

  const legacyCount = records.filter(
    (record) => record.source === "LEGACY",
  ).length;

  const platformCount = records.filter(
    (record) => record.source === "PLATFORM",
  ).length;

  return (
    <TeamOptixShell>
      <main className="workspace-shell">
        <section className="workspace-main platform-governance">
          <header className="domain-heading">
            <p className="eyebrow">TeamOptix · Platform</p>
            <h1>Switchboard</h1>
            <p>
              Govern the database concepts that may become Platform-owned.
              Nothing gets added to Platform unless it first has a Switchboard
              record.
            </p>
          </header>

          <section className="governance-guide">
            <div>
              <span>{records.length}</span>
              <p>
                <strong>Discovered records</strong>
                <small>Database objects registered for review.</small>
              </p>
            </div>

            <div>
              <span>{schemaCount}</span>
              <p>
                <strong>Schemas represented</strong>
                <small>Current ownership boundaries exposed here.</small>
              </p>
            </div>

            <div>
              <span>{platformCount}</span>
              <p>
                <strong>Platform authority</strong>
                <small>
                  {legacyCount} records remain on their legacy source.
                </small>
              </p>
            </div>
          </section>

          <section className="governance-list">
            <div className="governance-list__heading">
              <div>
                <h2>Schema inventory</h2>
                <p>{records.length} governed records</p>
              </div>
            </div>

            {records.map((record) => (
              <details className="governance-record" key={record.id}>
                <summary>
                  <span className="governance-record__identity">
                    <strong>{record.display_name}</strong>
                    <small>
                      {record.source_schema}.{record.source_object}
                    </small>
                  </span>

                  <span className="governance-record__meta">
                    {record.object_type}
                  </span>

                  <span
                    className={`governance-status governance-status--${
                      record.source === "PLATFORM" ? "active" : "draft"
                    }`}
                  >
                    {record.source}
                  </span>

                  <b>Manage</b>
                </summary>

                <form
                  action={updateSwitchboardRecord}
                  className="governance-form"
                >
                  <input type="hidden" name="id" value={record.id} />

                  <div className="governance-field-grid">
                    <label>
                      <span>Library key</span>
                      <input value={record.library_key} readOnly />
                    </label>

                    <label>
                      <span>Current object</span>
                      <input
                        value={`${record.source_schema}.${record.source_object}`}
                        readOnly
                      />
                    </label>

                    <label>
                      <span>Status</span>
                      <select name="status" defaultValue={record.status}>
                        <option value="DISCOVERED">Discovered</option>
                        <option value="DEFINED">Defined</option>
                        <option value="IMPLEMENTED">Implemented</option>
                        <option value="ACTIVE">Active</option>
                        <option value="RETIRED">Retired</option>
                      </select>
                    </label>

                    <label>
                      <span>Authoritative source</span>
                      <select name="source" defaultValue={record.source}>
                        <option value="LEGACY">Legacy</option>
                        <option value="PLATFORM">Platform</option>
                      </select>
                    </label>

                    <label className="governance-field--wide">
                      <span>Discovery notes</span>
                      <textarea
                        name="notes"
                        rows={3}
                        defaultValue={record.notes ?? ""}
                      />
                    </label>
                  </div>

                  <div className="governance-form__actions">
                    <button className="button button-primary" type="submit">
                      Save Switchboard record
                    </button>
                  </div>
                </form>
              </details>
            ))}
          </section>
        </section>
      </main>
    </TeamOptixShell>
  );
}
