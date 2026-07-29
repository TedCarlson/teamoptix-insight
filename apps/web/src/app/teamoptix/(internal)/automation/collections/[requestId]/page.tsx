import { notFound } from "next/navigation";
import Link from "next/link";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { getGovernedCompanies } from "@/features/teamoptix/command-center/commandCenter.server";
import TeamOptixShell from "@/features/teamoptix/navigation/TeamOptixShell";
import LocalDateTime from "@/features/automation/components/LocalDateTime";
import CollectionAutoRefresh from "./CollectionAutoRefresh";

export const dynamic = "force-dynamic";

function dateTime(value: unknown) {
  if (!value) return "—";
  return <LocalDateTime value={String(value)} />;
}

function timeOnly(value: unknown) {
  if (!value) return "—";
  return <LocalDateTime value={String(value)} display="time" />;
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

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function textList(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => textValue(item)).filter((item): item is string => Boolean(item))
    : [];
}

function duration(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  const milliseconds = Number(value);
  if (!Number.isFinite(milliseconds)) return "—";
  if (milliseconds < 1000) return `${milliseconds}ms`;
  const seconds = Math.round(milliseconds / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function elapsedBetween(start: unknown, end: unknown) {
  if (!start || !end) return null;
  const startMs = new Date(String(start)).getTime();
  const endMs = new Date(String(end)).getTime();
  return Number.isFinite(startMs) && Number.isFinite(endMs)
    ? Math.max(0, endMs - startMs)
    : null;
}

function reportLabel(value: unknown) {
  const key = String(value ?? "").toUpperCase();
  if (key.includes("WORK_AREA") || key.includes("WORK AREA") || key.includes("SERVICE_AREA_STATUS")) {
    return "FCC Work Area Summary";
  }
  if (key.includes("DELIVERY_MANIFEST") || key.includes("DELIVERY MANIFEST")) return "Delivery manifests";
  if (key.includes("PICKUP_MANIFEST") || key.includes("PICKUP MANIFEST")) return "Pickup manifests";
  if (key.includes("DSW") || key.includes("DAILY_SERVICE")) {
    return "Daily Service Worksheet";
  }
  return String(value ?? "Report").replaceAll("_", " ");
}

function friendlyOutcome(value: unknown) {
  const status = String(value ?? "ACTIVE").toUpperCase();
  if (["INGESTED", "NORMALIZED", "COMPLETE"].includes(status)) return "Ready to use";
  if (status === "IGNORED") return "Accepted";
  if (status === "FAILED") return "Needs attention";
  return "In progress";
}

function cycleExceptionSummary(events: any[]) {
  const exceptions = events.filter((event) =>
    ["DOWNLOAD_FAILED", "SOURCE_UNAVAILABLE", "NEEDS_ATTENTION"].includes(
      String(event.event_type ?? "").toUpperCase()
    )
  );
  if (!exceptions.length) return null;

  const downloadFailures = exceptions.filter(
    (event) =>
      String(event.event_type ?? "").toUpperCase() === "DOWNLOAD_FAILED"
  );
  const unavailable = exceptions.filter(
    (event) =>
      String(event.event_type ?? "").toUpperCase() === "SOURCE_UNAVAILABLE"
  );
  const attention = exceptions.filter(
    (event) =>
      String(event.event_type ?? "").toUpperCase() === "NEEDS_ATTENTION"
  );
  const artifactCounts = unavailable.reduce((counts, event) => {
    const key = String(event.artifact_key ?? "Unknown source")
      .replaceAll("_", " ")
      .toLowerCase()
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
    counts.set(key, (counts.get(key) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
  const reasonCounts = attention.reduce((counts, event) => {
    const metadata = objectValue(event.metadata_json);
    const key = String(metadata?.reason ?? "Unspecified")
      .replaceAll("_", " ")
      .toLowerCase()
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
    counts.set(key, (counts.get(key) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());

  const parts = [];
  if (downloadFailures.length) {
    parts.push(
      `${downloadFailures.length} requested report ${
        downloadFailures.length === 1 ? "download failed" : "downloads failed"
      }`
    );
  }
  if (unavailable.length) {
    const detail = [...artifactCounts.entries()]
      .map(([label, count]) => `${count} ${label}`)
      .join(", ");
    parts.push(
      `${unavailable.length} requested source exports were unavailable${
        detail ? ` (${detail})` : ""
      }`
    );
  }
  if (attention.length) {
    const detail = [...reasonCounts.entries()]
      .map(([label, count]) => `${count} ${label}`)
      .join(", ");
    parts.push(
      `${attention.length} collection ${
        attention.length === 1 ? "lane requires" : "lanes require"
      } attention${detail ? ` (${detail})` : ""}`
    );
  }

  const affectedRoutes = [
    ...new Set(
      exceptions
        .map((event) => String(event.route_identity ?? "").trim())
        .filter(Boolean)
    ),
  ];

  return `${parts.join("; ")}.${
    affectedRoutes.length
      ? ` Affected routes (${affectedRoutes.length}): ${affectedRoutes.join(", ")}.`
      : ""
  }`;
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

const tableViewport = {
  border: "1px solid #dbe4ef",
  borderRadius: 14,
  maxHeight: 520,
  overflow: "auto",
  overscrollBehavior: "contain",
} as const;

const stickyTh = {
  ...th,
  position: "sticky",
  top: 0,
  zIndex: 2,
  background: "#f8fafc",
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

  const [
    { data: artifacts, error },
    { data: runtime },
    { data: artifactRuntime },
    { data: runtimeEvents },
  ] = await Promise.all([
    db
      .from("operations_collection_artifact_v")
      .select("*")
      .eq("collection_request_id", requestId)
      .order("created_at", { ascending: true }),
    db
      .from("operations_collection_request_runtime_v")
      .select("*")
      .eq("collection_request_id", requestId)
      .maybeSingle(),
    db
      .from("operations_collection_artifact_runtime_v")
      .select("*")
      .eq("collection_request_id", requestId)
      .order("source_requested_at", { ascending: true }),
    db
      .from("operations_collection_runtime_event_v")
      .select("*")
      .eq("collection_request_id", requestId)
      .order("occurred_at", { ascending: true }),
  ]);

  if (error) throw new Error(error.message);

  const rows = [...(artifacts ?? [])].sort((left: any, right: any) => {
    const leftFailed = String(left.artifact_status).toUpperCase() === "FAILED" ? 0 : 1;
    const rightFailed = String(right.artifact_status).toUpperCase() === "FAILED" ? 0 : 1;
    return leftFailed - rightFailed;
  });
  const failedCount = rows.filter((row: any) => String(row.artifact_status).toUpperCase() === "FAILED").length;
  const active = ["QUEUED", "CLAIMED", "RUNNING", "ARTIFACTS_READY", "INGESTING"].includes(
    String(request.request_status).toUpperCase()
  );
  const terminalReceipt = objectValue(request.output_receipt_json);
  const receiptError = objectValue(terminalReceipt?.error);
  const failureEvidence = objectValue(receiptError?.evidence);
  const receiptDiagnostics = objectValue(terminalReceipt?.diagnostics);
  const diagnosticExcerpt = textList(
    failureEvidence?.log_excerpt ?? receiptDiagnostics?.log_excerpt
  );
  const diagnosticSources = textList(
    failureEvidence?.source_logs ?? receiptDiagnostics?.source_logs
  );
  const recordedCycleException = cycleExceptionSummary(runtimeEvents ?? []);
  const measuredRows = (artifactRuntime ?? []).length
    ? (artifactRuntime ?? []).map((artifact: any) => ({
        key: artifact.artifact_execution_key,
        report: reportLabel(artifact.lane_key || artifact.artifact_key),
        collectionMs:
          Number(artifact.source_generation_ms || 0) +
          Number(artifact.download_ms || 0) || null,
        uploadMs: artifact.upload_ms,
        queueMs: artifact.processing_queue_ms,
        processingMs: artifact.processing_ms,
        registeredAt: artifact.registered_at,
        fullyIngestedAt: artifact.processing_completed_at,
        outcome: friendlyOutcome(artifact.outcome),
      }))
    : rows.map((artifact: any) => ({
        key: artifact.id,
        report: reportLabel(
          artifact.normalized_filename ||
            artifact.runner_artifact_json?.artifact_key ||
            artifact.report_family_key
        ),
        collectionMs:
          artifact.runner_elapsed_ms ??
          artifact.runner_artifact_json?.runner_elapsed_ms ??
          null,
        uploadMs: null,
        queueMs: elapsedBetween(artifact.created_at, artifact.ingest_started_at),
        processingMs:
          artifact.ingest_duration_ms ??
          elapsedBetween(artifact.ingest_started_at, artifact.ingest_completed_at),
        registeredAt: artifact.created_at,
        fullyIngestedAt: artifact.ingest_completed_at,
        outcome: friendlyOutcome(artifact.artifact_status),
      }));
  const hasDetailedRuntime = (artifactRuntime ?? []).length > 0;
  let summaryRows = Array.from(
    measuredRows.reduce((groups: Map<string, any>, row: any) => {
      const current = groups.get(row.report);
      if (!current) {
        groups.set(row.report, { ...row, count: 1 });
        return groups;
      }
      current.count += 1;
      for (const field of ["collectionMs", "uploadMs", "queueMs", "processingMs"]) {
        const next = Number(row[field]);
        if (Number.isFinite(next)) {
          current[field] = Math.max(Number(current[field]) || 0, next);
        }
      }
      if (row.outcome === "Needs attention") current.outcome = row.outcome;
      return groups;
    }, new Map<string, any>()).values()
  );
  if (!hasDetailedRuntime) {
    const manifestRows = summaryRows.filter((row: any) =>
      String(row.report).toLowerCase().includes("manifest")
    );
    if (manifestRows.length > 0) {
      summaryRows = [
        ...summaryRows.filter((row: any) =>
          !String(row.report).toLowerCase().includes("manifest")
        ),
        {
          ...manifestRows[0],
          key: "legacy-shared-manifest-section",
          report: "Manifest collection",
          count: manifestRows.reduce(
            (total: number, row: any) => total + Number(row.count || 0),
            0
          ),
          collectionMs: Math.max(
            ...manifestRows.map((row: any) => Number(row.collectionMs) || 0)
          ),
          registeredAt: manifestRows
            .map((row: any) => row.registeredAt)
            .filter(Boolean)
            .sort()
            .at(-1),
          fullyIngestedAt: null,
        },
      ];
    }
  }
  const slowest = summaryRows
    .flatMap((row: any) => [
      {
        report: row.report,
        label: hasDetailedRuntime
          ? "getting the file from FedEx"
          : "inside its runner section",
        value: Number(row.collectionMs),
      },
      { report: row.report, label: "waiting for processing", value: Number(row.queueMs) },
      { report: row.report, label: "processing the file", value: Number(row.processingMs) },
    ])
    .filter((item: any) => Number.isFinite(item.value) && item.value > 0)
    .sort((left: any, right: any) => right.value - left.value)[0];

  return (
    <TeamOptixShell>
    <main className="workspace-shell teamoptix-domain-overview">
      <section className="workspace-main" style={{ display: "grid", gap: 18 }}>
      <CollectionAutoRefresh active={active} requestId={requestId} />
      <header className="domain-heading">
        <p style={{ margin: "0 0 12px" }}>
          <Link href="/teamoptix/automation/collections" style={{ color: "#2563eb", fontWeight: 850, textDecoration: "none" }}>
            Automation / Collections
          </Link>
        </p>
        <span style={{ color: "#009b77", fontSize: 12, fontWeight: 900, letterSpacing: ".12em", textTransform: "uppercase" }}>
          TeamOptix · Collection evidence
        </span>
        <h1 style={{ margin: "8px 0 4px", color: "#17233d" }}>Collection journey</h1>
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

      {recordedCycleException ? (
        <section
          style={{
            ...card,
            borderColor: "#fdba74",
            background: "#fffaf2",
            color: "#9a3412",
          }}
        >
          <strong>Cycle exceptions</strong>
          <p style={{ margin: "8px 0 0" }}>{recordedCycleException}</p>
          <p style={{ margin: "8px 0 0", color: "#7c2d12", fontSize: 13 }}>
            The successful files remain usable. The affected source lanes and
            route identities are retained in the technical runtime event trail
            below.
          </p>
        </section>
      ) : null}

      {failureEvidence ? (
        <section style={{ ...card, borderColor: "#fca5a5", background: "#fffafa" }}>
          <span style={{ color: "#b91c1c", fontSize: 11, fontWeight: 900, letterSpacing: ".1em", textTransform: "uppercase" }}>
            Failure evidence
          </span>
          <h2 style={{ margin: "6px 0 6px", color: "#17233d" }}>
            {textValue(failureEvidence.summary) || "The runner preserved technical evidence for this failure."}
          </h2>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", color: "#60708a", fontSize: 13 }}>
            <span><strong style={{ color: "#25334d" }}>Stage:</strong> {textValue(failureEvidence.stage)?.replaceAll("_", " ") || "Unknown"}</span>
            {textValue(failureEvidence.exception_type) ? (
              <span><strong style={{ color: "#25334d" }}>Exception:</strong> {textValue(failureEvidence.exception_type)}</span>
            ) : null}
            {diagnosticSources.length ? (
              <span><strong style={{ color: "#25334d" }}>Runner log:</strong> {diagnosticSources.join(", ")}</span>
            ) : null}
          </div>
          {textValue(failureEvidence.technical_message) ? (
            <p style={{ margin: "12px 0 0", color: "#7f1d1d" }}>
              {textValue(failureEvidence.technical_message)}
            </p>
          ) : null}
        </section>
      ) : null}

      {terminalReceipt ? (
        <section style={{ ...card }}>
          <details open={Boolean(failureEvidence)}>
            <summary style={{ cursor: "pointer", fontWeight: 900, color: "#17233d" }}>
              Stored terminal JSON and runner log evidence
            </summary>
            <p style={{ color: "#60708a", margin: "10px 0" }}>
              This is the information-dense receipt submitted once when the run ended. Sensitive values are excluded and the log tail is bounded.
            </p>
            {diagnosticExcerpt.length ? (
              <>
                <h3 style={{ margin: "16px 0 8px", color: "#17233d", fontSize: 15 }}>Bounded runner log</h3>
                <pre style={{ margin: 0, padding: 14, borderRadius: 12, background: "#0f172a", color: "#dbeafe", whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 11, maxHeight: 420, overflow: "auto" }}>
                  {diagnosticExcerpt.join("\n")}
                </pre>
              </>
            ) : (
              <p style={{ color: "#92400e" }}>
                This older receipt predates bounded log capture. The runner’s local journal may still contain the detailed cause.
              </p>
            )}
            <details style={{ marginTop: 14 }}>
              <summary style={{ cursor: "pointer", fontWeight: 800 }}>Raw terminal receipt</summary>
              <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 11, color: "#334155" }}>
                {JSON.stringify(terminalReceipt, null, 2)}
              </pre>
            </details>
          </details>
        </section>
      ) : null}

      {measuredRows.length ? (
        <section style={{ ...card }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div>
              <span style={{ color: "#009b77", fontSize: 11, fontWeight: 900, letterSpacing: ".1em", textTransform: "uppercase" }}>
                Where the time went
              </span>
              <h2 style={{ margin: "5px 0 4px", color: "#17233d" }}>
                {slowest
                  ? `${slowest.report} spent the most time ${slowest.label}.`
                  : "Timing evidence is arriving."}
              </h2>
              <p style={{ margin: 0, color: "#60708a" }}>
                {slowest
                  ? `${duration(slowest.value)} was spent in that step.`
                  : "This page refreshes once when the active collection reaches a terminal state."}
              </p>
            </div>
            {runtime?.end_to_end_ms ? (
              <div style={{ minWidth: 150 }}>
                <small>Total elapsed time</small>
                <strong style={{ display: "block", color: "#17233d", fontSize: 26 }}>
                  {duration(runtime.end_to_end_ms)}
                </strong>
              </div>
            ) : null}
          </div>
          <div style={{ ...tableViewport, marginTop: 18, maxHeight: 360 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
              <thead>
                <tr>
                  <th style={{ ...stickyTh, left: 0, zIndex: 3 }}>Report</th>
                  <th style={stickyTh}>Files</th>
                  <th style={stickyTh}>{hasDetailedRuntime ? "Getting it from FedEx" : "Runner section elapsed"}</th>
                  <th style={stickyTh}>Upload</th>
                  <th style={stickyTh}>Waiting to process</th>
                  <th style={stickyTh}>Processing</th>
                  <th style={stickyTh}>Result</th>
                </tr>
              </thead>
              <tbody>
                {summaryRows.map((row: any) => (
                  <tr key={row.key}>
                    <td style={{ ...td, position: "sticky", left: 0, zIndex: 1, background: "#fff" }}><strong>{row.report}</strong></td>
                    <td style={td}>{row.count}</td>
                    <td style={td}>{duration(row.collectionMs)}</td>
                    <td style={td}>{duration(row.uploadMs)}</td>
                    <td style={td}>{duration(row.queueMs)}</td>
                    <td style={td}>{duration(row.processingMs)}</td>
                    <td style={{ ...td, fontWeight: 850 }}>{row.outcome}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details style={{ marginTop: 16 }}>
            <summary style={{ cursor: "pointer", fontWeight: 900, color: "#17233d" }}>
              Full record
            </summary>
            <p style={{ color: "#60708a", margin: "10px 0" }}>
              A side-by-side timeline of every report measured in this collection.
            </p>
            <div style={{ ...tableViewport, maxHeight: 420 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 680 }}>
                <thead>
                  <tr>
                    <th style={{ ...stickyTh, left: 0, zIndex: 3 }}>Stage</th>
                    {summaryRows.map((row: any) => (
                      <th style={stickyTh} key={row.key}>{row.report}{row.count > 1 ? ` (${row.count} files)` : ""}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    {
                      label: "Request created",
                      value: () => timeOnly(request.created_at),
                      emphasis: false,
                    },
                    {
                      label: "Registered",
                      value: (row: any) => timeOnly(row.registeredAt),
                      emphasis: false,
                    },
                    {
                      label: "Runner segment",
                      value: (row: any) => duration(row.collectionMs),
                      emphasis: true,
                    },
                    {
                      label: "Worker queue wait",
                      value: (row: any) => duration(row.queueMs),
                      emphasis: true,
                    },
                    {
                      label: "Ingestion",
                      value: (row: any) => duration(row.processingMs),
                      emphasis: true,
                    },
                    {
                      label: "Fully ingested",
                      value: (row: any) => timeOnly(row.fullyIngestedAt),
                      emphasis: false,
                    },
                  ].map((stage) => (
                    <tr key={stage.label}>
                      <td style={{ ...td, position: "sticky", left: 0, zIndex: 1, background: "#fff" }}>{stage.label}</td>
                      {summaryRows.map((row: any) => (
                        <td
                          style={{
                            ...td,
                            fontWeight: stage.emphasis ? 900 : 500,
                          }}
                          key={`${stage.label}:${row.key}`}
                        >
                          {stage.value(row)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </section>
      ) : null}

      <section style={{ ...card, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "18px 20px 10px" }}>
          <h2 style={{ margin: 0, color: "#17233d" }}>Files in this collection</h2>
          <p style={{ margin: "5px 0 0", color: "#60708a" }}>Scroll inside this table to inspect all {rows.length} files.</p>
        </div>
        <div style={{ ...tableViewport, borderLeft: 0, borderRight: 0, borderBottom: 0, borderRadius: 0 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
          <thead>
            <tr>
              <th style={{ ...stickyTh, left: 0, zIndex: 3 }}>File</th>
              <th style={stickyTh}>Type</th>
              <th style={stickyTh}>Route</th>
              <th style={stickyTh}>Service date</th>
              <th style={stickyTh}>Status</th>
              <th style={stickyTh}>Rows</th>
              <th style={stickyTh}>Attempts</th>
              <th style={stickyTh}>Updated</th>
              <th style={stickyTh}>Outcome detail</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((artifact: any) => {
              const failed = String(artifact.artifact_status).toUpperCase() === "FAILED";
              const errorMessage = artifactError(artifact);
              const ingest = artifact.ingest_metadata_json?.ingest ?? artifact.ingest_metadata_json ?? {};
              return (
                <tr key={artifact.id} style={{ background: failed ? "#fff7f7" : undefined }}>
                  <td style={{ ...td, position: "sticky", left: 0, zIndex: 1, background: failed ? "#fff7f7" : "#fff" }}><strong>{artifactName(artifact)}</strong><small style={{ display: "block", color: "#718096", marginTop: 4 }}>{artifact.id}</small></td>
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
                      <summary style={{ cursor: "pointer", fontWeight: 800 }}>Raw technical record</summary>
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
        </div>
      </section>

      {(runtimeEvents ?? []).length ? (
        <section style={{ ...card }}>
          <details>
            <summary style={{ cursor: "pointer", fontWeight: 900 }}>
              Technical runtime event trail ({runtimeEvents?.length ?? 0})
            </summary>
            <div style={{ ...tableViewport, marginTop: 12 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
                <thead><tr><th style={th}>Occurred</th><th style={th}>Owner</th><th style={th}>Stage</th><th style={th}>Event</th><th style={th}>Lane / artifact</th><th style={th}>Duration</th><th style={th}>Outcome</th></tr></thead>
                <tbody>{(runtimeEvents ?? []).map((event: any) => <tr key={event.id}><td style={td}>{dateTime(event.occurred_at)}</td><td style={td}>{event.source_system}</td><td style={td}>{event.stage}</td><td style={td}>{event.event_type}</td><td style={td}>{event.lane_key || event.artifact_key || "—"}</td><td style={td}>{duration(event.duration_ms)}</td><td style={td}>{event.outcome || "—"}</td></tr>)}</tbody>
              </table>
            </div>
          </details>
        </section>
      ) : null}
      </section>
    </main>
    </TeamOptixShell>
  );
}
