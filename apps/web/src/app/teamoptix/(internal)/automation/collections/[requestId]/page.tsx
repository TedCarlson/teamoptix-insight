import { notFound } from "next/navigation";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { getGovernedCompanies } from "@/features/teamoptix/command-center/commandCenter.server";

export const dynamic = "force-dynamic";

function dateTime(value: unknown) {
  if (!value) return "—";
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString();
}

function artifactName(artifact: any) {
  return artifact.original_filename || artifact.normalized_filename || artifact.storage_path || "Unnamed artifact";
}

function artifactType(artifact: any) {
  return artifact.report_family_key || artifact.manifest_type || artifact.artifact_kind || "Unknown";
}

function artifactError(artifact: any) {
  return artifact.error_message || artifact.ingest_metadata_json?.error || artifact.runner_artifact_json?.error || null;
}

const card = {
  border: "1px solid #dbe4ef",
  borderRadius: 18,
  background: "#fff",
  padding: 20,
} as const;

const th = {
  padding: "10px 12px",
  textAlign: "left",
  color: "#60708a",
  fontSize: 12,
  borderBottom: "1px solid #dbe4ef",
} as const;

const td = {
  padding: "12px",
  verticalAlign: "top",
  borderBottom: "1px solid #edf1f6",
  color: "#25334d",
  fontSize: 13,
} as const;

export default async function Page({ params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params;
  const db = createSupabaseServiceRoleClient();
  const governedCompanies = await getGovernedCompanies();
  const governedIds = governedCompanies.map((company) => company.id);

  const { data: request } = await db
    .from("operations_collection_request_v")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();

  if (!request || !governedIds.includes(String(request.company_id))) notFound();

  const { data: artifacts, error } = await db
    .from("operations_collection_artifact_v")
    .select("*")
    .eq("collection_request_id", requestId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  const rows = [...(artifacts ?? [])].sort((left: any, right: any) => {
    const leftFailed = String(left.artifact_status).toUpperCase() === "FAILED" ? 0 : 1;
    const rightFailed = String(right.artifact_status).toUpperCase() === "FAILED" ? 0 : 1;
    return leftFailed - rightFailed;
  });
  const failedCount = rows.filter((row: any) => String(row.artifact_status).toUpperCase() === "FAILED").length;

  return (
    <main style={{ display: "grid", gap: 18 }}>
      <header>
        <span style={{ color: "#009b77", fontSize: 12, fontWeight: 900, letterSpacing: ".12em", textTransform: "uppercase" }}>
          TeamOptix · Collection evidence
        </span>
        <h1 style={{ margin: "8px 0 4px", color: "#17233d" }}>Artifact outcomes</h1>
        <p style={{ margin: 0, color: "#60708a" }}>
          {request.company_slug} · {String(request.request_type).replaceAll("_", " ")} · created {dateTime(request.created_at)}
        </p>
      </header>

      <section style={{ ...card, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14 }}>
        <div><small>Status</small><strong style={{ display: "block" }}>{request.request_status}</strong></div>
        <div><small>Registered files</small><strong style={{ display: "block" }}>{rows.length}</strong></div>
        <div><small>Ingested</small><strong style={{ display: "block" }}>{rows.filter((row: any) => ["INGESTED", "IGNORED"].includes(String(row.artifact_status).toUpperCase())).length}</strong></div>
        <div><small>Failed</small><strong style={{ display: "block", color: failedCount ? "#b91c1c" : "inherit" }}>{failedCount}</strong></div>
      </section>

      {request.error_message ? (
        <section style={{ ...card, borderColor: "#fecaca", background: "#fff7f7", color: "#991b1b" }}>
          <strong>Request outcome</strong>
          <p style={{ marginBottom: 0 }}>{request.error_message}</p>
        </section>
      ) : null}

      <section style={{ ...card, overflowX: "auto", padding: 0 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
          <thead>
            <tr>
              <th style={th}>File</th>
              <th style={th}>Type</th>
              <th style={th}>Route</th>
              <th style={th}>Service date</th>
              <th style={th}>Status</th>
              <th style={th}>Rows</th>
              <th style={th}>Attempts</th>
              <th style={th}>Updated</th>
              <th style={th}>Outcome detail</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((artifact: any) => {
              const failed = String(artifact.artifact_status).toUpperCase() === "FAILED";
              const errorMessage = artifactError(artifact);
              const ingest = artifact.ingest_metadata_json?.ingest ?? artifact.ingest_metadata_json ?? {};
              return (
                <tr key={artifact.id} style={{ background: failed ? "#fff7f7" : undefined }}>
                  <td style={td}><strong>{artifactName(artifact)}</strong><small style={{ display: "block", color: "#718096", marginTop: 4 }}>{artifact.id}</small></td>
                  <td style={td}>{artifactType(artifact)}</td>
                  <td style={td}>{artifact.route_label || artifact.route_key || artifact.runner_artifact_json?.route_key || "—"}</td>
                  <td style={td}>{artifact.service_date || "—"}</td>
                  <td style={{ ...td, color: failed ? "#b91c1c" : "#25334d", fontWeight: 900 }}>{artifact.artifact_status}</td>
                  <td style={td}>{ingest.inserted_row_count ?? ingest.row_count ?? "—"}</td>
                  <td style={td}>{artifact.attempt_count ?? 0}</td>
                  <td style={td}>{dateTime(artifact.updated_at)}</td>
                  <td style={{ ...td, maxWidth: 420 }}>
                    {errorMessage ? <strong style={{ color: "#b91c1c" }}>{String(errorMessage)}</strong> : "No error recorded."}
                    <details style={{ marginTop: 8 }}>
                      <summary style={{ cursor: "pointer", fontWeight: 800 }}>Full record</summary>
                      <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 11, color: "#334155" }}>
                        {JSON.stringify(artifact, null, 2)}
                      </pre>
                    </details>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 ? <tr><td style={td} colSpan={9}>No artifact records were registered for this request.</td></tr> : null}
          </tbody>
        </table>
      </section>
    </main>
  );
}
