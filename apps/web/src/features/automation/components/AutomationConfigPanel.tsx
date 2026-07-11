"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CollectionOrderDrawer } from "./CollectionOrderDrawer";
import { COLLECTION_PROFILES } from "./automationCollectionConfig";
import { formatDateTime, formatDuration, formatRequestTiming, formatStatus, formatTime, summarizeArtifacts } from "./automationFormatters";
import { MiniStat, ProfileCard, SectionCard } from "./automationShared";
import { credentialEditorBox, credentialField, credentialInput, credentialNotice, credentialSignalButton, executiveSignalGrid, grid4, leadText, mutedCopy, policyStrip, profileGrid, td, th } from "./automationStyles";
import type { AutomationConfigPanelProps, AutomationRun, AutomationStatusResponse, CollectionOrderDraft, CollectionRequest, CredentialResponse, ProtectedCollectionType, ScheduleRow } from "./automation.types";

export default function AutomationConfigPanel(props: AutomationConfigPanelProps) {
  const customerManagesCredential =
    (props.credentialMode ?? "customer_managed") === "customer_managed";
  const governanceWorkspace =
    (props.workspaceMode ?? "customer") === "governance";
  const showOperationsWorkspace =
    props.showOperationsWorkspace !== false;
  const [status, setStatus] = useState<AutomationStatusResponse | null>(null);
  const [credential, setCredential] = useState<CredentialResponse | null>(null);
  const [scheduleRows, setScheduleRows] = useState<ScheduleRow[]>([]);
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [collectionRequests, setCollectionRequests] = useState<CollectionRequest[]>([]);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [showCredentialEditor, setShowCredentialEditor] = useState(false);
  const [queueingRequest, setQueueingRequest] = useState<string | null>(null);
  const [selectedCollection, setSelectedCollection] = useState<ProtectedCollectionType | null>(null);

  const [artifacts, setArtifacts] = useState<any[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    const res = await fetch(`/api/company/${props.slug}/automation/status`, {
      cache: "no-store",
      credentials: "include",
    });

    const data = await res.json();

    if (!res.ok) throw new Error(data?.error ?? "Failed to load status.");

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

  const loadSchedule = useCallback(async () => {
    const res = await fetch(`/api/company/${props.slug}/automation/schedule`, {
      cache: "no-store",
      credentials: "include",
    });

    const data = await res.json();

    if (!res.ok) throw new Error(data?.error ?? "Failed to load schedule.");

    setScheduleRows(Array.isArray(data?.rows) ? data.rows : []);
  }, [props.slug]);

  const loadRuns = useCallback(async () => {
    const res = await fetch(`/api/company/${props.slug}/automation/runs?limit=20`, {
      cache: "no-store",
      credentials: "include",
    });

    const data = await res.json();

    if (!res.ok) throw new Error(data?.error ?? "Failed to load runs.");

    setRuns(Array.isArray(data?.rows) ? data.rows : []);
  }, [props.slug]);

  const loadCollectionRequests = useCallback(async () => {
    const res = await fetch(`/api/company/${props.slug}/collection-requests?limit=10`, {
      cache: "no-store",
      credentials: "include",
    });

    const data = await res.json();

    if (!res.ok) throw new Error(data?.error ?? "Failed to load collection requests.");

    setCollectionRequests(Array.isArray(data?.rows) ? data.rows : []);
  }, [props.slug]);

  const loadArtifacts = useCallback(async () => {
    const res = await fetch(`/api/company/${props.slug}/operations/artifacts?limit=100`, {
      cache: "no-store",
      credentials: "include",
    });

    const data = await res.json();

    if (!res.ok) throw new Error(data?.error ?? "Failed to load artifacts.");

    setArtifacts(Array.isArray(data?.rows) ? data.rows : []);
  }, [props.slug]);

  const loadAll = useCallback(async () => {
    await Promise.all([loadStatus(), loadCredential(), loadSchedule(), loadRuns(), loadCollectionRequests(), loadArtifacts()]);
  }, [loadStatus, loadCredential, loadSchedule, loadRuns, loadCollectionRequests, loadArtifacts]);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setStatusError(null);
        await loadAll();
      } catch (error) {
        if (!active) return;
        setStatusError(error instanceof Error ? error.message : "Failed to load automation.");
      }
    }

    if (props.slug) void load();

    return () => {
      active = false;
    };
  }, [props.slug, loadAll]);

  const latestDswRun = useMemo(() => runs.find((run) => run.automation_type === "DSW") ?? null, [runs]);
  const latestFccRun = useMemo(() => runs.find((run) => run.automation_type === "FCC") ?? null, [runs]);
  const successCount = runs.filter((run) => run.status === "SUCCESS").length;
  const failedCount = runs.filter((run) => run.status === "FAILED").length;
  const enabledCount = scheduleRows.filter((row) => row.is_enabled && row.window_preset !== "OFF").length;

  const reportSeams = ["DSW", "FCC"].map((family) => {
    const run = runs.find((item) => item.automation_type === family) ?? null;
    const artifact = artifacts.find((item) => item.report_family_key === family) ?? null;
    const request = collectionRequests.find((item) => item.requested_reports?.includes(family)) ?? null;
    const batchId = run?.batch_id ?? artifact?.report_batch_id ?? null;
    const errorMessage = artifact?.error_message ?? run?.error_message ?? request?.error_message ?? null;

    const ingestStatus =
      artifact?.artifact_status === "INGESTED" || run?.status === "SUCCESS"
        ? "Success"
        : artifact?.artifact_status === "FAILED" || run?.status === "FAILED"
          ? "Failed"
          : artifact?.artifact_status === "INGESTING"
            ? "Ingesting"
            : "Pending";

    return {
      family,
      collectionStatus: request?.request_status ?? "—",
      artifactStatus: artifact?.artifact_status ?? "—",
      ingestStatus,
      warehouseStatus: batchId ? "Updated" : "Pending",
      duration: formatDuration(run?.duration_ms),
      runtime: formatTime(artifact?.updated_at ?? run?.completed_at ?? run?.started_at),
      notes: errorMessage ?? (run ? `${run.inserted_rows ?? "—"} rows · ${run.matched_rows ?? "—"}/${run.unmatched_rows ?? "—"} match` : "—"),
    };
  });
  async function queueProtectedCollectionRequest(draft: CollectionOrderDraft) {
    try {
      setQueueingRequest(draft.request_type);
      setMessage(null);
      setStatusError(null);

      const res = await fetch(`/api/company/${props.slug}/collection-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(draft),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data?.error ?? "Failed to prepare collection order.");

      await Promise.all([loadCollectionRequests(), loadArtifacts()]);
      setSelectedCollection(null);
      setMessage("Collection order prepared.");
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : "Failed to prepare collection order.");
    } finally {
      setQueueingRequest(null);
    }
  }


  async function saveCredential() {
    try {
      setSaving(true);
      setMessage(null);
      setStatusError(null);

      const res = await fetch(`/api/company/${props.slug}/automation/credentials`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data?.error ?? "Failed to save credentials.");

      setPassword("");
      await Promise.all([loadCredential(), loadStatus()]);
      setMessage("Credentials saved.");
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : "Failed to save credentials.");
    } finally {
      setSaving(false);
    }
  }

  async function verifyCredential() {
    try {
      setVerifying(true);
      setMessage(null);
      setStatusError(null);

      const res = await fetch(`/api/company/${props.slug}/automation/verify`, {
        method: "POST",
        credentials: "include",
      });

      const data = await res.json();

      await Promise.all([loadCredential(), loadStatus()]);

      if (!res.ok) throw new Error(data?.message ?? data?.error ?? "Verification failed.");

      setMessage(data?.message ?? "Credentials verified.");
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : "Verification failed.");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <section style={{ display: "grid", gap: 10 }}>
      <SectionCard eyebrow="Insight Collection Center" title="Collection Health">
        <p style={leadText}>
          Operational dashboards stay current while required platform collections protect historical reporting.
        </p>

        <div style={executiveSignalGrid}>
          <MiniStat label="Collection Health" value={formatStatus(status?.status ?? null)} />

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

          <MiniStat label="Last Successful Collection" value={formatTime(latestDswRun?.started_at ?? latestFccRun?.started_at)} />
        </div>

        <div style={policyStrip}>
          <span style={{ fontWeight: 950, color: "#166534" }}>✓ Platform policy:</span>
          <span>Required integrity collections always receive priority.</span>
        </div>

        {customerManagesCredential && showCredentialEditor ? (
          <div style={credentialEditorBox}>
            <div style={credentialNotice}>
              <strong>Credential changes affect report collection.</strong>
              <span>
                Insight uses this connection only when a collection order is executed. Updating it controls whether the runner can
                reach FedEx and collect operational reports for this company.
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
              <label style={credentialField}>
                <span>FedEx Username</span>
                <input
                  style={credentialInput}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
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
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={credential?.has_secret ? "Enter new password to replace" : "Enter password"}
                  disabled={!props.canEdit}
                />
              </label>
            </div>

            <div className="cta-row">
              <button
                type="button"
                className="button button-primary"
                disabled={!props.canEdit || saving || !username.trim() || !password.trim()}
                onClick={saveCredential}
              >
                {saving ? "Saving..." : "Save Credentials"}
              </button>

              <button
                type="button"
                className="button"
                disabled={!props.canEdit || verifying || !credential?.has_secret}
                onClick={verifyCredential}
              >
                {verifying ? "Testing..." : "Test Connection"}
              </button>

              <button type="button" className="button" onClick={() => setShowCredentialEditor(false)}>
                Close
              </button>
            </div>
          </div>
        ) : null}

        {message ? <p style={{ color: "#0f9f6e", fontWeight: 800, marginBottom: 0 }}>{message}</p> : null}
        {statusError ? <p style={{ color: "#c62828", fontWeight: 800, marginBottom: 0 }}>{statusError}</p> : null}
      </SectionCard>

      {showOperationsWorkspace ? (
        <>
          <SectionCard
            eyebrow="Protected Collections"
            title={
              governanceWorkspace
                ? "Platform collection controls"
                : "Collection orders Insight depends on"
            }
          >
            <p style={mutedCopy}>
              {governanceWorkspace
                ? "Review the current ticket contract, ownership, cadence, priority, and latest request state for this customer."
                : "These collection orders protect the data foundation Insight needs to produce trustworthy operational intelligence."}
            </p>

            {governanceWorkspace ? (
              <div style={{ overflowX: "auto" }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: 12,
                  }}
                >
                  <thead>
                    <tr style={{ color: "#64748b", textAlign: "left" }}>
                      <th style={th}>Collection</th>
                      <th style={th}>Ownership</th>
                      <th style={th}>Schedule / purpose</th>
                      <th style={th}>Reports</th>
                      <th style={th}>Priority</th>
                      <th style={th}>Latest request</th>
                    </tr>
                  </thead>

                  <tbody>
                    {COLLECTION_PROFILES.map((profile) => {
                      const latestRequest =
                        collectionRequests.find(
                          (request) =>
                            request.request_type === profile.type
                        ) ?? null;

                      const ownership =
                        profile.type === "TARGETED_RECOVERY"
                          ? "Team Optix manual"
                          : "Team Optix governed";

                      return (
                        <tr key={profile.type}>
                          <td style={td}>
                            <strong>{profile.title}</strong>
                            <div
                              style={{
                                color: "#64748b",
                                fontSize: 11,
                                fontWeight: 750,
                                marginTop: 3,
                              }}
                            >
                              {profile.description}
                            </div>
                          </td>

                          <td style={td}>{ownership}</td>
                          <td style={td}>{profile.footer}</td>
                          <td style={td}>
                            {profile.reports.join(" · ")}
                          </td>
                          <td style={td}>{profile.priority}</td>
                          <td style={td}>
                            {latestRequest
                              ? `${latestRequest.request_status} · ${formatTime(
                                  latestRequest.created_at
                                )}`
                              : "No request recorded"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={profileGrid}>
                {COLLECTION_PROFILES.map((profile) => {
                  const customerCanPrepare =
                    profile.type === "TARGETED_RECOVERY";

                  return (
                    <ProfileCard
                      key={profile.type}
                      title={profile.title}
                      badge={profile.badge}
                      tone={profile.tone}
                      description={profile.description}
                      reports={profile.reports}
                      footer={
                        customerCanPrepare
                          ? profile.footer
                          : `${profile.footer} · Managed by Team Optix`
                      }
                      disabled={!customerCanPrepare}
                      onClick={
                        customerCanPrepare
                          ? () => setSelectedCollection(profile.type)
                          : undefined
                      }
                    />
                  );
                })}
              </div>
            )}
          </SectionCard>

      <SectionCard eyebrow="Request Warehouse" title="Recent collection requests">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <p style={mutedCopy}>Active dock work plus the latest healthy completion signal.</p>
          <button
            type="button"
            className="button"
            onClick={async () => {
              setStatusError(null);

              const res = await fetch(`/api/company/${props.slug}/operations/artifact-ingest`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ source: "queue_refresh_button" }),
              });

              if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                setStatusError(data?.error ?? "Queue refresh failed.");
              }

              await Promise.all([loadCollectionRequests(), loadArtifacts(), loadRuns()]);
            }}
          >
            Refresh Queue
          </button>
        </div>

        <div style={grid4}>
          <MiniStat label="Requests" value={collectionRequests.length} />
          <MiniStat label="Queued" value={collectionRequests.filter((request) => request.request_status === "QUEUED").length} />
          <MiniStat label="Running" value={collectionRequests.filter((request) => request.request_status === "RUNNING" || request.request_status === "CLAIMED").length} />
          <MiniStat label="Complete" value={collectionRequests.filter((request) => request.request_status === "COMPLETE").length} />
        </div>

        <div style={{ overflowX: "auto", marginTop: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ color: "#64748b", textAlign: "left" }}>
                <th style={th}>Created</th>
                <th style={th}>Request</th>
                <th style={th}>Status</th>
                <th style={th}>Priority</th>
                <th style={th}>Date</th>
                <th style={th}>Reports</th>
                <th style={th}>Timing</th>
                <th style={th}>Duration</th>
                <th style={th}>Artifacts</th>
              </tr>
            </thead>
            <tbody>
              {collectionRequests.map((request) => {
                const requestArtifacts = artifacts.filter((artifact) => artifact.collection_request_id === request.id);

                return (
                  <tr key={request.id}>
                    <td style={td}>{formatTime(request.created_at)}</td>
                    <td style={td}>{request.request_type}</td>
                    <td style={td}>{request.request_status}</td>
                    <td style={td}>{request.priority}</td>
                    <td style={td}>{request.service_date ?? request.service_date_start ?? "—"}</td>
                    <td style={td}>{request.requested_reports?.join(", ") || "—"}</td>
                    <td style={td}>{formatRequestTiming(request)}</td>
                    <td style={td}>{formatDuration(request.duration_ms)}</td>
                    <td style={td}>
                      {summarizeArtifacts(requestArtifacts)}
                    </td>
                  </tr>
                );
              })}
              {collectionRequests.length === 0 ? (
                <tr>
                  <td style={td} colSpan={9}>No collection requests yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

      </SectionCard>

      <SectionCard eyebrow="Runtime inspection" title="Latest report seams">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ color: "#64748b", textAlign: "left" }}>
                <th style={th}>Report</th>
                <th style={th}>Collection</th>
                <th style={th}>Artifact</th>
                <th style={th}>Ingest</th>
                <th style={th}>Warehouse</th>
                <th style={th}>Duration</th>
                <th style={th}>Runtime</th>
                <th style={th}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {reportSeams.map((row) => (
                <tr key={row.family}>
                  <td style={td}>{row.family}</td>
                  <td style={td}>{row.collectionStatus}</td>
                  <td style={td}>{row.artifactStatus}</td>
                  <td style={td}>{row.ingestStatus}</td>
                  <td style={td}>{row.warehouseStatus}</td>
                  <td style={td}>{row.duration}</td>
                  <td style={td}>{row.runtime}</td>
                  <td style={td}>{row.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <CollectionOrderDrawer
        key={selectedCollection ?? "collection-order-drawer"}
        profile={COLLECTION_PROFILES.find((profile) => profile.type === selectedCollection) ?? null}
        canEdit={props.canEdit}
        queueing={Boolean(queueingRequest && queueingRequest === selectedCollection)}
        onClose={() => setSelectedCollection(null)}
        onSubmit={queueProtectedCollectionRequest}
      />

      <SectionCard eyebrow="Historical hydration" title="DSW historical sweep">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
          <MiniStat label="Mode" value="DSW only" />
          <MiniStat label="Range" value="Target / historical" />
          <MiniStat label="Queue" value="Pending build" />
        </div>
      </SectionCard>

      <SectionCard eyebrow="Run history" title="Automation audit trail">
        <div style={grid4}>
          <MiniStat label="Runs" value={runs.length} />
          <MiniStat label="Success" value={successCount} />
          <MiniStat label="Failures" value={failedCount} />
          <MiniStat label="Enabled" value={enabledCount} />
        </div>

        <div style={{ overflowX: "auto", marginTop: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ color: "#64748b", textAlign: "left" }}>
                <th style={th}>Started</th>
                <th style={th}>Type</th>
                <th style={th}>Status</th>
                <th style={th}>Duration</th>
                <th style={th}>Rows</th>
                <th style={th}>Match</th>
                <th style={th}>Batch</th>
              </tr>
            </thead>
            <tbody>
              {runs.slice(0, 10).map((run) => (
                <tr key={run.id}>
                  <td style={td}>{formatTime(run.started_at)}</td>
                  <td style={td}>{run.automation_type}</td>
                  <td style={td}>{run.status}</td>
                  <td style={td}>{formatDuration(run.duration_ms)}</td>
                  <td style={td}>{run.inserted_rows ?? "—"}</td>
                  <td style={td}>
                    {run.matched_rows ?? "—"} / {run.unmatched_rows ?? "—"}
                  </td>
                  <td style={td}>{run.batch_id ? run.batch_id.slice(0, 8) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
        </>
      ) : null}
    </section>
  );
}
