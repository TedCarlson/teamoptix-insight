import TeamOptixDomainOverview from "@/features/teamoptix/shared/TeamOptixDomainOverview";
import { getAutomationOverview } from "@/features/teamoptix/shared/teamOptixOverview.server";
import { isActiveCollectionRequest, isCleanCompleteCollectionRequest, isCollectionRequestException } from "@/features/automation/lib/collectionRequestOutcome";
import LocalDateTime from "@/features/automation/components/LocalDateTime";

export const dynamic = "force-dynamic";

function exceptionExplanation(message: unknown) {
  const text = String(message ?? "").trim();
  const lower = text.toLowerCase();
  if (lower.includes("read operation timed out")) {
    return "The runner stopped receiving data before collection finished. Open the record to see what arrived and what is missing.";
  }
  if (lower.includes("partial artifacts registered")) {
    return "Usable files arrived, but the runner ended abnormally. Open the record to see completed and missing work.";
  }
  const exitCode = text.match(/exit code\s+(\d+)/i)?.[1];
  if (exitCode) {
    return `The runner ended with code ${exitCode}. A plain-language cause was not recorded; open the record for available evidence.`;
  }
  return text
    ? `${text} Open the record for the affected stage and available evidence.`
    : "This request did not reach a clean outcome. Open the record to see the affected stage.";
}

function compactDuration(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const milliseconds = Number(value);
  if (!Number.isFinite(milliseconds)) return null;
  const seconds = Math.round(milliseconds / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function elapsed(start: unknown, end: unknown) {
  if (!start || !end) return null;
  const startMs = new Date(String(start)).getTime();
  const endMs = new Date(String(end)).getTime();
  return Number.isFinite(startMs) && Number.isFinite(endMs)
    ? Math.max(0, endMs - startMs)
    : null;
}

function runtimeSummary(request: any, artifacts: any[]) {
  const requestArtifacts = artifacts.filter(
    (artifact) => artifact.collection_request_id === request.id
  );
  const primaryReports = requestArtifacts.filter((artifact) => {
    const name = String(artifact.normalized_filename ?? "").toUpperCase();
    return name.includes("WORK AREA") || name.includes("DAILY SERVICE");
  });
  const manifests = requestArtifacts.filter((artifact) =>
    String(artifact.normalized_filename ?? "").toUpperCase().includes("MANIFEST")
  );
  const primaryReadyAt = primaryReports
    .map((artifact) => artifact.ingest_completed_at ?? artifact.updated_at)
    .filter(Boolean)
    .sort()
    .at(-1);
  const primaryReadyMs = elapsed(request.created_at, primaryReadyAt);
  const manifestSectionMs = manifests.reduce(
    (maximum, artifact) =>
      Math.max(maximum, Number(artifact.runner_elapsed_ms) || 0),
    0
  );
  const parts = [
    compactDuration(request.duration_ms)
      ? `Total ${compactDuration(request.duration_ms)}`
      : null,
    primaryReports.length && primaryReadyMs !== null
      ? `Primary reports usable in ${compactDuration(primaryReadyMs)}`
      : null,
    manifests.length && manifestSectionMs > 0
      ? `Manifest section ${compactDuration(manifestSectionMs)}`
      : null,
    `${request.ingested_count ?? 0}/${request.registered_count ?? 0} files processed`,
  ].filter(Boolean);
  return parts.join(" · ");
}

export default async function Page() {
  const data = await getAutomationOverview();
  const attention = data.requests.filter(isCollectionRequestException);
  const failed = data.requests.filter((row: any) => row.request_status === "FAILED");
  const active = data.requests.filter(isActiveCollectionRequest);
  const complete = data.requests.filter(isCleanCompleteCollectionRequest);
  return <TeamOptixDomainOverview eyebrow="TeamOptix · Automation" title="Collections" description="Follow every generated request from demand through ingestion evidence."
    metrics={[{ label: "7-day requests", value: data.requests.length, detail: "Governed customer scope" }, { label: "Active", value: active.length, detail: "Queued through ingestion" }, { label: "Clean completion", value: complete.length, detail: "Finished without a recorded exception" }, { label: "Needs review", value: attention.length, detail: `${failed.length} failed · ${attention.length - failed.length} completed with exceptions` }]}
    panels={[{ eyebrow: "Collection trail", title: "Recent requests", rows: data.requests.slice(0, 12).map((row: any) => ({ title: `${String(row.request_type).replaceAll("_", " ")} · ${row.request_status === "COMPLETE" && row.error_message ? "COMPLETE WITH EXCEPTIONS" : row.request_status}`, detail: <>{row.company_slug} · <LocalDateTime value={String(row.created_at)} /> · {runtimeSummary(row, data.artifacts)}{row.error_message ? ` · Review: ${exceptionExplanation(row.error_message)}` : ""}</>, status: row.request_status === "COMPLETE" && row.error_message ? "Degraded" : row.request_status, href: `/teamoptix/automation/collections/${row.id}` })) }, { eyebrow: "Needs review", title: "What requires attention—and why", rows: attention.length ? attention.slice(0, 8).map((row: any) => ({ title: `${String(row.request_type).replaceAll("_", " ")} · ${row.request_status === "FAILED" ? "FAILED" : "COMPLETED WITH EXCEPTIONS"}`, detail: `${row.company_slug} · ${runtimeSummary(row, data.artifacts)} · ${exceptionExplanation(row.error_message)}`, status: row.request_status === "FAILED" ? "Failed" : "Degraded", href: `/teamoptix/automation/collections/${row.id}` })) : [{ title: "Nothing requires review", detail: "Every collection in the trailing seven days finished without a recorded exception.", status: "Healthy", href: "/teamoptix/automation/collections" }] }]}
  />;
}
