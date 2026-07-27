"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  formatDateTime,
  formatDuration,
  formatRequestTiming,
  formatStatus,
  formatTime,
} from "./automationFormatters";
import { MiniStat, SectionCard } from "./automationShared";
import RunnerScheduleEditor, {
  defaultRunnerSchedule,
} from "./RunnerScheduleEditor";
import {
  credentialEditorBox,
  credentialField,
  credentialInput,
  credentialNotice,
  credentialSignalButton,
  executiveSignalGrid,
  grid4,
  leadText,
  mutedCopy,
  policyStrip,
  td,
  th,
} from "./automationStyles";
import type {
  AutomationConfigPanelProps,
  AutomationStatusResponse,
  CollectionRecoveryCandidate,
  CollectionRequest,
  CollectionRuntimeBaseline,
  CredentialResponse,
  RunnerSchedule,
} from "./automation.types";

const ACTIVE_REQUEST_STATUSES = new Set([
  "QUEUED",
  "CLAIMED",
  "RUNNING",
  "ARTIFACTS_READY",
  "INGESTING",
]);

const TERMINAL_REQUEST_STATUSES = new Set([
  "COMPLETE",
  "FAILED",
  "CANCELLED",
]);

function formatRequestDate(request: CollectionRequest) {
  if (request.service_date) return request.service_date;
  if (!request.service_date_start) return "—";
  if (
    request.service_date_end &&
    request.service_date_end !== request.service_date_start
  ) {
    return `${request.service_date_start} – ${request.service_date_end}`;
  }
  return request.service_date_start;
}

function compactDuration(value: number | null | undefined) {
  if (value === null || value === undefined) return null;
  if (value < 1000) return `${value}ms`;
  const seconds = Math.round(value / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

function runtimeStory(request: CollectionRequest) {
  const runtime = request.runtime;
  if (!runtime || runtime.event_count === 0) return [];
  return [
    ["Claim", runtime.claim_wait_ms],
    ["Auth", runtime.authentication_ms],
    ["Collect", runtime.collection_ms],
    ["Source avg", runtime.average_source_generation_ms],
    ["Download avg", runtime.average_download_ms],
    ["Upload avg", runtime.average_upload_ms],
    ["Worker wait avg", runtime.average_processing_queue_ms],
    ["Process avg", runtime.average_processing_ms],
    ["Reconcile", runtime.reconciliation_ms],
  ].flatMap(([label, value]) => {
    const formatted = compactDuration(value as number | null);
    return formatted ? [`${label} ${formatted}`] : [];
  });
}

export default function AutomationConfigPanel(
  props: AutomationConfigPanelProps
) {
  const customerManagesCredential =
    (props.credentialMode ?? "customer_managed") === "customer_managed";

  const [status, setStatus] =
    useState<AutomationStatusResponse | null>(null);
  const [credential, setCredential] =
    useState<CredentialResponse | null>(null);
  const [collectionRequests, setCollectionRequests] = useState<
    CollectionRequest[]
  >([]);
  const [recoveryCandidates, setRecoveryCandidates] = useState<
    CollectionRecoveryCandidate[]
  >([]);
  const [runtimeBaselines, setRuntimeBaselines] = useState<
    CollectionRuntimeBaseline[]
  >([]);
  const [runnerSchedule, setRunnerSchedule] =
    useState<RunnerSchedule | null>(null);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [queuingRecovery, setQueuingRecovery] = useState<string | null>(null);
  const [showCredentialEditor, setShowCredentialEditor] = useState(false);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [observedRequestIds, setObservedRequestIds] = useState<string[]>([]);
  const completedRequestIds = useRef(new Set<string>());

  const loadStatus = useCallback(async () => {
    const res = await fetch(
      `/api/company/${props.slug}/automation/status`,
      {
        cache: "no-store",
        credentials: "include",
      }
    );

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data?.error ?? "Failed to load collection health.");
    }

    setStatus(data);
  }, [props.slug]);

  const loadCredential = useCallback(async () => {
    const endpoint = customerManagesCredential
      ? `/api/company/${props.slug}/automation/credentials`
      : `/api/company/${props.slug}/automation/credential-status`;

    const res = await fetch(endpoint, {
      cache: "no-store",
      credentials: "include",
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(
        data?.error ?? "Failed to load credential status."
      );
    }

    setCredential(data);

    if (customerManagesCredential) {
      setUsername(data?.username ?? "");
    } else {
      setUsername("");
      setPassword("");
      setShowCredentialEditor(false);
    }
  }, [props.slug, customerManagesCredential]);

  const loadCollectionRequests = useCallback(async () => {
    const res = await fetch(
      `/api/company/${props.slug}/collection-requests?mode=today&limit=50`,
      {
        cache: "no-store",
        credentials: "include",
      }
    );

    const data = await res.json();

    if (!res.ok) {
      throw new Error(
        data?.error ?? "Failed to load collection requests."
      );
    }

    setCollectionRequests(
      Array.isArray(data?.rows) ? data.rows : []
    );
    setRuntimeBaselines(
      Array.isArray(data?.baselines) ? data.baselines : []
    );
  }, [props.slug]);

  const loadRecoveryCandidates = useCallback(async () => {
    const res = await fetch(
      `/api/company/${props.slug}/collection-requests?mode=recovery&limit=50`,
      { cache: "no-store", credentials: "include" }
    );
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error ?? "Failed to load recovery queue.");
    }
    setRecoveryCandidates(Array.isArray(data?.rows) ? data.rows : []);
  }, [props.slug]);

  const loadRunnerSchedule = useCallback(async () => {
    if (props.workspaceMode !== "governance") return;

    const res = await fetch(
      `/api/company/${props.slug}/automation/schedule`,
      { cache: "no-store", credentials: "include" }
    );
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data?.error ?? "Failed to load the runner schedule.");
    }

    setRunnerSchedule(
      data?.row ??
        defaultRunnerSchedule({
          companySlug: props.slug,
          runnerKey: data?.runner_key,
        })
    );
  }, [props.slug, props.workspaceMode]);

  const loadAll = useCallback(async () => {
    await Promise.all([
      loadStatus(),
      loadCredential(),
      loadCollectionRequests(),
      loadRecoveryCandidates(),
      loadRunnerSchedule(),
    ]);
  }, [
    loadStatus,
    loadCredential,
    loadCollectionRequests,
    loadRecoveryCandidates,
    loadRunnerSchedule,
  ]);

  const loadQueueSnapshot = useCallback(
    () =>
      Promise.all([
        loadStatus(),
        loadCollectionRequests(),
        loadRecoveryCandidates(),
      ]),
    [loadCollectionRequests, loadRecoveryCandidates, loadStatus]
  );

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setStatusError(null);
        await loadAll();
      } catch (error) {
        if (!active) return;
        setStatusError(
          error instanceof Error
            ? error.message
            : "Failed to load collection center."
        );
      }
    }

    if (props.slug) void load();

    return () => {
      active = false;
    };
  }, [props.slug, loadAll]);

  const activeRequestIds = useMemo(
    () =>
      Array.from(
        new Set([
          ...collectionRequests
            .filter((request) =>
              ACTIVE_REQUEST_STATUSES.has(request.request_status)
            )
            .map((request) => request.id),
          ...observedRequestIds,
        ])
      ),
    [collectionRequests, observedRequestIds]
  );

  // The page may already be open when Vercel Cron creates the next request.
  // Listen only for that company's INSERT so the new request ID can be handed
  // to a request-scoped terminal listener without polling the warehouse.
  useEffect(() => {
    if (!status?.company_id) return;

    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(`collection-created:${status.company_id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "core",
          table: "operations_collection_request",
          filter: `company_id=eq.${status.company_id}`,
        },
        (payload: { new: Record<string, unknown> }) => {
          const requestId = String(payload.new.id ?? "");
          const requestStatus = String(
            payload.new.request_status ?? ""
          ).toUpperCase();
          if (!requestId || !ACTIVE_REQUEST_STATUSES.has(requestStatus)) return;
          setObservedRequestIds((current) =>
            current.includes(requestId) ? current : [...current, requestId]
          );
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [status?.company_id]);

  // Each active request gets one narrowly scoped listener. Intermediate
  // transitions are ignored; a terminal transition causes one warehouse
  // hydration and then the listener disappears.
  useEffect(() => {
    if (activeRequestIds.length === 0) return;

    const supabase = getSupabaseBrowserClient();
    const channels = activeRequestIds.map((requestId) =>
      supabase
        .channel(`collection-terminal:${requestId}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "core",
            table: "operations_collection_request",
            filter: `id=eq.${requestId}`,
          },
          (payload: { new: Record<string, unknown> }) => {
            const requestStatus = String(
              payload.new.request_status ?? ""
            ).toUpperCase();
            if (
              !TERMINAL_REQUEST_STATUSES.has(requestStatus) ||
              completedRequestIds.current.has(requestId)
            ) {
              return;
            }

            completedRequestIds.current.add(requestId);
            setObservedRequestIds((current) =>
              current.filter((id) => id !== requestId)
            );
            void loadQueueSnapshot().catch((error) => {
              setStatusError(
                error instanceof Error
                  ? error.message
                  : "Failed to refresh the completed collection."
              );
            });
          }
        )
        .subscribe()
    );

    return () => {
      for (const channel of channels) {
        void supabase.removeChannel(channel);
      }
    };
  }, [activeRequestIds, loadQueueSnapshot]);

  const latestSuccessfulCollection = useMemo(
    () =>
      collectionRequests.find(
        (request) => request.request_status === "COMPLETE" && !request.error_message
      ) ?? null,
    [collectionRequests]
  );

  const queuedCount = collectionRequests.filter(
    (request) => request.request_status === "QUEUED"
  ).length;

  const runningCount = collectionRequests.filter(
    (request) =>
      request.request_status === "RUNNING" ||
      request.request_status === "CLAIMED" ||
      request.request_status === "ARTIFACTS_READY" ||
      request.request_status === "INGESTING"
  ).length;

  const completeCount = collectionRequests.filter(
    (request) => request.request_status === "COMPLETE" && !request.error_message
  ).length;

  function requestStatusLabel(status: string) {
    if (status === "QUEUED") return "Waiting for runner";
    if (status === "CLAIMED") return "Runner starting";
    if (status === "RUNNING") return "Collecting files";
    if (status === "ARTIFACTS_READY") return "Files delivered · processing";
    if (status === "INGESTING") return "Processing files";
    if (status === "COMPLETE") return "Complete";
    if (status === "FAILED") return "Failed";
    if (status === "CANCELLED") return "Cancelled";
    return status;
  }

  async function refreshRequests() {
    try {
      setRefreshing(true);
      setStatusError(null);
      await loadQueueSnapshot();
    } catch (error) {
      setStatusError(
        error instanceof Error
          ? error.message
          : "Failed to refresh collection requests."
      );
    } finally {
      setRefreshing(false);
    }
  }

  async function queueRecovery(candidate: CollectionRecoveryCandidate) {
    try {
      setQueuingRecovery(candidate.candidate_key);
      setStatusError(null);
      const res = await fetch(
        `/api/company/${props.slug}/collection-requests`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            recovery_of_request_id: candidate.collection_request_id,
            artifact_id: candidate.artifact_id,
            service_date: candidate.service_date,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to queue recovery.");
      await Promise.all([loadCollectionRequests(), loadRecoveryCandidates()]);
      setMessage(`Recovery queued for ${candidate.service_date}.`);
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : "Failed to queue recovery.");
    } finally {
      setQueuingRecovery(null);
    }
  }

  async function saveCredential() {
    try {
      setSaving(true);
      setMessage(null);
      setStatusError(null);

      const res = await fetch(
        `/api/company/${props.slug}/automation/credentials`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ username, password }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          data?.error ?? "Failed to save credentials."
        );
      }

      setPassword("");
      await Promise.all([loadCredential(), loadStatus()]);
      setMessage("Credentials saved.");
    } catch (error) {
      setStatusError(
        error instanceof Error
          ? error.message
          : "Failed to save credentials."
      );
    } finally {
      setSaving(false);
    }
  }

  async function verifyCredential() {
    try {
      setVerifying(true);
      setMessage(null);
      setStatusError(null);

      const res = await fetch(
        `/api/company/${props.slug}/automation/verify`,
        {
          method: "POST",
          credentials: "include",
        }
      );

      const data = await res.json();

      await Promise.all([loadCredential(), loadStatus()]);

      if (!res.ok) {
        throw new Error(
          data?.message ??
            data?.error ??
            "Verification failed."
        );
      }

      setMessage(data?.message ?? "Credentials verified.");
    } catch (error) {
      setStatusError(
        error instanceof Error
          ? error.message
          : "Verification failed."
      );
    } finally {
      setVerifying(false);
    }
  }

  async function saveRunnerSchedule(row: RunnerSchedule) {
    try {
      setScheduleSaving(true);
      setMessage(null);
      setStatusError(null);

      const res = await fetch(
        `/api/company/${props.slug}/automation/schedule`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(row),
        }
      );
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to save the runner schedule.");
      }

      setRunnerSchedule(data?.row ?? row);
      setMessage(
        data?.runner_sync?.status === "APPLIED"
          ? "Schedule saved and applied to the runner."
          : `Schedule saved but is pending runner delivery.${
              data?.runner_sync?.error
                ? ` ${data.runner_sync.error}`
                : ""
            }`
      );
    } catch (error) {
      setStatusError(
        error instanceof Error
          ? error.message
          : "Failed to save the runner schedule."
      );
    } finally {
      setScheduleSaving(false);
    }
  }

  return (
    <section style={{ display: "grid", gap: 10 }}>
      <SectionCard
        eyebrow="Insight Collection Center"
        title="Collection Health"
      >
        <p style={leadText}>
          Operational dashboards stay current while Insight protects
          the day&apos;s collection trail.
        </p>

        <div style={executiveSignalGrid}>
          <MiniStat
            label="Collection Health"
            value={formatStatus(status?.status ?? null)}
          />

          {customerManagesCredential ? (
            <button
              type="button"
              style={credentialSignalButton}
              disabled={!props.canEdit}
              onClick={() =>
                setShowCredentialEditor((value) => !value)
              }
            >
              <span className="context-stat__label">
                FedEx Connection
              </span>

              <strong>
                {credential?.has_secret
                  ? "Credentials Current"
                  : "Credentials Needed"}
              </strong>

              <span
                style={{
                  color: "#2563eb",
                  fontSize: 11,
                  fontWeight: 900,
                }}
              >
                {showCredentialEditor
                  ? "Click to close"
                  : "Click to update"}
              </span>

              <span
                style={{
                  color: "#64748b",
                  fontSize: 12,
                  fontWeight: 800,
                }}
              >
                {credential?.has_secret
                  ? `Last verified ${formatDateTime(
                      credential.last_verified_at
                    )}`
                  : "Click to add credentials"}
              </span>
            </button>
          ) : (
            <div style={credentialSignalButton}>
              <span className="context-stat__label">
                FedEx Connection
              </span>

              <strong>
                {credential?.has_secret
                  ? "Credentials Current"
                  : "Customer Action Required"}
              </strong>

              <span
                style={{
                  color: credential?.has_secret
                    ? "#166534"
                    : "#b45309",
                  fontSize: 11,
                  fontWeight: 900,
                }}
              >
                Customer managed
              </span>

              <span
                style={{
                  color: "#64748b",
                  fontSize: 12,
                  fontWeight: 800,
                }}
              >
                {credential?.last_verified_at
                  ? `Last verified ${formatDateTime(
                      credential.last_verified_at
                    )}`
                  : "No successful verification recorded"}
              </span>
            </div>
          )}

          <MiniStat
            label="Last Successful Collection"
            value={formatTime(
              latestSuccessfulCollection?.updated_at ?? null
            )}
          />
        </div>

        <div style={policyStrip}>
          <span style={{ fontWeight: 950, color: "#166534" }}>
            ✓ Platform policy:
          </span>
          <span>
            Today&apos;s collection records remain visible as the
            relay advances.
          </span>
        </div>

        {customerManagesCredential && showCredentialEditor ? (
          <div style={credentialEditorBox}>
            <div style={credentialNotice}>
              <strong>
                Credential changes affect report collection.
              </strong>
              <span>
                Insight uses this connection only when a collection
                order is executed.
              </span>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(2, minmax(0, 1fr))",
                gap: 10,
              }}
            >
              <label style={credentialField}>
                <span>FedEx Username</span>
                <input
                  style={credentialInput}
                  value={username}
                  onChange={(event) =>
                    setUsername(event.target.value)
                  }
                  placeholder="Enter username"
                  disabled={!props.canEdit}
                />
              </label>

              <label style={credentialField}>
                <span>Password</span>
                <input
                  style={credentialInput}
                  type="password"
                  value={password}
                  onChange={(event) =>
                    setPassword(event.target.value)
                  }
                  placeholder={
                    credential?.has_secret
                      ? "Enter new password to replace"
                      : "Enter password"
                  }
                  disabled={!props.canEdit}
                />
              </label>
            </div>

            <div className="cta-row">
              <button
                type="button"
                className="button button-primary"
                disabled={
                  !props.canEdit ||
                  saving ||
                  !username.trim() ||
                  !password.trim()
                }
                onClick={saveCredential}
              >
                {saving ? "Saving..." : "Save Credentials"}
              </button>

              <button
                type="button"
                className="button"
                disabled={
                  !props.canEdit ||
                  verifying ||
                  !credential?.has_secret
                }
                onClick={verifyCredential}
              >
                {verifying ? "Testing..." : "Test Connection"}
              </button>

              <button
                type="button"
                className="button"
                onClick={() => setShowCredentialEditor(false)}
              >
                Close
              </button>
            </div>
          </div>
        ) : null}

        {message ? (
          <p
            style={{
              color: "#0f9f6e",
              fontWeight: 800,
              marginBottom: 0,
            }}
          >
            {message}
          </p>
        ) : null}

        {statusError ? (
          <p
            style={{
              color: "#c62828",
              fontWeight: 800,
              marginBottom: 0,
            }}
          >
            {statusError}
          </p>
        ) : null}
      </SectionCard>

      {props.workspaceMode === "governance" && runnerSchedule ? (
        <RunnerScheduleEditor
          row={runnerSchedule}
          disabled={!props.canEdit}
          saving={scheduleSaving}
          onChange={setRunnerSchedule}
          onSave={saveRunnerSchedule}
        />
      ) : null}

      <SectionCard
        eyebrow="Request Warehouse"
        title="Recent collection requests"
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            marginBottom: 12,
          }}
        >
          <p style={mutedCopy}>
            Today&apos;s collection trail, newest first.
          </p>

          <button
            type="button"
            className="button"
            disabled={refreshing}
            onClick={refreshRequests}
          >
            {refreshing ? "Refreshing..." : "Refresh Queue"}
          </button>
        </div>

        <div style={grid4}>
          <MiniStat
            label="Requests"
            value={collectionRequests.length}
          />
          <MiniStat label="Queued" value={queuedCount} />
          <MiniStat label="Running" value={runningCount} />
          <MiniStat label="Complete" value={completeCount} />
        </div>

        {runtimeBaselines.length ? (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              marginTop: 12,
            }}
          >
            {runtimeBaselines.map((baseline) => (
              <span
                key={`${baseline.request_type}:${baseline.execution_mode}`}
                style={{
                  border: "1px solid #dbe4ef",
                  borderRadius: 999,
                  padding: "7px 10px",
                  color: "#526681",
                  fontSize: 10,
                  fontWeight: 800,
                }}
              >
                {baseline.request_type.replaceAll("_", " ")} ·{" "}
                {baseline.execution_mode.toLowerCase()} ·{" "}
                {baseline.measured_run_count} runs · median{" "}
                {compactDuration(baseline.median_end_to_end_ms)} · p95{" "}
                {compactDuration(baseline.p95_end_to_end_ms)}
              </span>
            ))}
          </div>
        ) : null}

        <div style={{ overflowX: "auto", marginTop: 12 }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 12,
            }}
          >
            <thead>
              <tr
                style={{
                  color: "#64748b",
                  textAlign: "left",
                }}
              >
                <th style={th}>Created</th>
                <th style={th}>Request</th>
                <th style={th}>Status</th>
                <th style={th}>Date</th>
                <th style={th}>Reports</th>
                <th style={th}>Timing</th>
                <th style={th}>Duration</th>
                <th style={th}>Progress / Output</th>
              </tr>
            </thead>

            <tbody>
              {collectionRequests.map((request) => (
                <tr key={request.id}>
                  <td style={td}>
                    {formatTime(request.created_at)}
                  </td>
                  <td style={td}>{request.request_type}</td>
                  <td style={td}>
                    <strong>{requestStatusLabel(request.request_status)}</strong>
                    {request.error_message ? (
                      <span style={{ display: "block", maxWidth: 280, marginTop: 3, color: "#b91c1c", lineHeight: 1.35 }}>
                        {request.error_message}
                      </span>
                    ) : null}
                  </td>
                  <td style={td}>
                    {formatRequestDate(request)}
                  </td>
                  <td style={td}>
                    {request.requested_reports?.join(", ") ||
                      "—"}
                  </td>
                  <td style={td}>
                    {formatRequestTiming(request)}
                  </td>
                  <td style={td}>
                    {formatDuration(request.duration_ms)}
                    {runtimeStory(request).length ? (
                      <span
                        style={{
                          display: "block",
                          minWidth: 210,
                          marginTop: 4,
                          color: "#64748b",
                          fontSize: 10,
                          lineHeight: 1.45,
                        }}
                      >
                        {runtimeStory(request).join(" · ")}
                      </span>
                    ) : null}
                  </td>
                  <td style={td}>
                    <a
                      href={`/teamoptix/automation/collections/${request.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: "block",
                        color: "inherit",
                        fontWeight: 850,
                        textDecoration: "underline",
                        textUnderlineOffset: 2,
                      }}
                      aria-label={`Open the full collection record for ${request.request_type}`}
                    >
                      {`${request.ingested_count ?? 0}/${
                        request.registered_count ?? 0
                      } files processed`}
                    </a>
                    {(request.ready_count ?? 0) > 0 ||
                    (request.ingesting_count ?? 0) > 0 ||
                    (request.failed_count ?? 0) > 0 ? (
                      <span
                        style={{
                          display: "block",
                          marginTop: 2,
                          color:
                            (request.failed_count ?? 0) > 0
                              ? "#b91c1c"
                              : "#64748b",
                        }}
                      >
                        {`${request.ready_count ?? 0} waiting · ${
                          request.ingesting_count ?? 0
                        } processing · `}
                        {(request.failed_count ?? 0) > 0 ? (
                          <a
                            href={`/teamoptix/automation/collections/${request.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: "inherit", fontWeight: 900, textDecoration: "underline" }}
                            aria-label={`Open ${request.failed_count} failed artifact${request.failed_count === 1 ? "" : "s"} in a new tab`}
                          >
                            {request.failed_count} failed
                          </a>
                        ) : (
                          "0 failed"
                        )}
                      </span>
                    ) : null}
                    <span
                      style={{
                        display: "block",
                        marginTop: 2,
                        color: "#64748b",
                      }}
                    >
                      {`${request.report_count ?? 0} reports · ${
                        request.manifest_count ?? 0
                      } manifests · ${request.route_count ?? 0} routes`}
                    </span>
                  </td>
                </tr>
              ))}

              {collectionRequests.length === 0 ? (
                <tr>
                  <td style={td} colSpan={8}>
                    No collection requests recorded today.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {recoveryCandidates.length > 0 ? (
        <SectionCard eyebrow="Previous-day close" title="Dates requiring recovery">
          <p style={mutedCopy}>
            Only failed previous-day closes appear here. A date leaves after its
            replacement close is processed successfully.
          </p>
          <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
            {recoveryCandidates.map((candidate) => (
              <div
                key={candidate.candidate_key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: 12,
                  border: "1px solid #dbe4f0",
                  borderRadius: 14,
                  background: "#fff",
                }}
              >
                <div>
                  <strong>{candidate.service_date}</strong>
                  <span style={{ display: "block", color: "#64748b", marginTop: 2 }}>
                    {candidate.report_family_key ?? candidate.failed_request_type}
                    {candidate.original_filename ? ` · ${candidate.original_filename}` : ""}
                    {` · ${candidate.attempt_count} failed close ${candidate.attempt_count === 1 ? "attempt" : "attempts"}`}
                  </span>
                </div>
                <button
                  type="button"
                  className="button button-primary"
                  disabled={!props.canEdit || queuingRecovery === candidate.candidate_key}
                  onClick={() => queueRecovery(candidate)}
                >
                  {queuingRecovery === candidate.candidate_key
                    ? "Queuing retry..."
                    : "Retry collection"}
                </button>
              </div>
            ))}
          </div>
        </SectionCard>
      ) : null}
    </section>
  );
}
