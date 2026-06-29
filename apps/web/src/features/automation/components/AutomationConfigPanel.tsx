"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CollectionOrderDrawer } from "./CollectionOrderDrawer";
import { COLLECTION_PROFILES } from "./automationCollectionConfig";
import { formatDateTime, formatDuration, formatRequestTiming, formatStatus, formatTime, formatWindow, summarizeArtifacts } from "./automationFormatters";
import { MiniStat, ProfileCard, RunSummary, SectionCard } from "./automationShared";
import { credentialEditorBox, credentialField, credentialInput, credentialNotice, credentialSignalButton, executiveSignalGrid, grid4, leadText, mutedCopy, policyStrip, profileGrid, td, th, twoCol, workdayRefreshCard } from "./automationStyles";
import { ScheduleEditor } from "./ScheduleEditor";
import type { AutomationConfigPanelProps, AutomationRun, AutomationStatusResponse, CollectionOrderDraft, CollectionRequest, CredentialResponse, ProtectedCollectionType, ScheduleRow } from "./automation.types";

export default function AutomationConfigPanel(props: AutomationConfigPanelProps) {
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
  const [savingScheduleKey, setSavingScheduleKey] = useState<string | null>(null);
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
    const res = await fetch(`/api/company/${props.slug}/automation/credentials`, {
      cache: "no-store",
      credentials: "include",
    });

    const data = await res.json();

    if (!res.ok) throw new Error(data?.error ?? "Failed to load credentials.");

    setCredential(data);
    setUsername(data?.username ?? "");
  }, [props.slug]);

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
    const res = await fetch(`/api/company/${props.slug}/operations/artifacts?status=READY_FOR_INGEST&limit=25`, {
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
  const nextRunLabel =
    enabledCount > 0
      ? scheduleRows
          .filter((row) => row.is_enabled && row.window_preset !== "OFF")
          .map((row) => `${row.automation_type}: ${row.cadence_minutes}m`)
          .join(" · ")
      : "Not scheduled";

  const activeRefreshRows = scheduleRows.filter((row) => row.is_enabled && row.window_preset !== "OFF");
  const activeRefreshReports = activeRefreshRows.map((row) => row.automation_type);
  const refreshCadenceLabel =
    activeRefreshRows.length > 0
      ? `${Math.min(...activeRefreshRows.map((row) => row.cadence_minutes))} min`
      : "Not scheduled";
  const refreshWindowLabel =
    activeRefreshRows.length > 0
      ? activeRefreshRows.map((row) => `${row.automation_type}: ${formatWindow(row)}`).join(" · ")
      : "No active window";

  async function queueWorkdayRefreshRequest() {
    try {
      setQueueingRequest("OPERATIONS_FEED");
      setMessage(null);
      setStatusError(null);

      const res = await fetch(`/api/company/${props.slug}/collection-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          request_type: "OPERATIONS_FEED",
          requested_reports: activeRefreshReports,
          priority: 80,
          request_payload: {
            source: "collection_center",
            intent: "workday_refresh",
            request_origin: "user_collection_center",
            cadence_minutes: activeRefreshRows.length > 0
              ? Math.min(...activeRefreshRows.map((row) => row.cadence_minutes))
              : null,
            windows: activeRefreshRows.map((row) => ({
              report: row.automation_type,
              window_preset: row.window_preset,
              start_time: row.start_time,
              end_time: row.end_time,
              cadence_minutes: row.cadence_minutes,
            })),
          },
        }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data?.error ?? "Failed to prepare refresh ticket.");

      await Promise.all([loadCollectionRequests(), loadArtifacts()]);
      setMessage("Workday refresh ticket prepared.");
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : "Failed to prepare refresh ticket.");
    } finally {
      setQueueingRequest(null);
    }
  }

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

  async function saveSchedule(row: ScheduleRow) {
    try {
      setSavingScheduleKey(row.automation_type);
      setMessage(null);
      setStatusError(null);

      const res = await fetch(`/api/company/${props.slug}/automation/schedule`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          automation_type: row.automation_type,
          is_enabled: row.window_preset === "OFF" ? false : row.is_enabled,
          cadence_minutes: row.cadence_minutes,
          window_preset: row.window_preset,
          start_time: row.start_time,
          end_time: row.end_time,
        }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data?.error ?? "Failed to save schedule.");

      await loadSchedule();
      setMessage(`${row.automation_type} schedule saved.`);
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : "Failed to save schedule.");
    } finally {
      setSavingScheduleKey(null);
    }
  }

  function updateScheduleRow(next: ScheduleRow) {
    setScheduleRows((current) =>
      current.map((row) =>
        row.id === next.id || row.automation_type === next.automation_type
          ? next
          : row
      )
    );
  }

  const scheduleRowsToShow = scheduleRows.filter((row) => ["DSW", "FCC"].includes(row.automation_type));

  return (
    <section style={{ display: "grid", gap: 10 }}>
      <SectionCard eyebrow="Insight Collection Center" title="Collection Health">
        <p style={leadText}>
          Operational dashboards stay current while required platform collections protect historical reporting.
        </p>

        <div style={executiveSignalGrid}>
          <MiniStat label="Collection Health" value={formatStatus(status?.status ?? null)} />

          <button
            type="button"
            style={credentialSignalButton}
            disabled={!props.canEdit}
            onClick={() => setShowCredentialEditor((value) => !value)}
          >
            <span className="context-stat__label">FedEx Connection</span>
            <strong>{credential?.has_secret ? "Credentials Current" : "Credentials Needed"}</strong>
            <span style={{ color: "#2563eb", fontSize: 11, fontWeight: 900 }}>
              {showCredentialEditor ? "Click to close" : "Click to update"}
            </span>
            <span style={{ color: "#64748b", fontSize: 12, fontWeight: 800 }}>
              {credential?.has_secret
                ? `Last verified ${formatDateTime(credential?.last_verified_at)}`
                : "Click to add credentials"}
            </span>
          </button>

          <MiniStat label="Last Successful Collection" value={formatTime(latestDswRun?.started_at ?? latestFccRun?.started_at)} />
        </div>

        <div style={policyStrip}>
          <span style={{ fontWeight: 950, color: "#166534" }}>✓ Platform policy:</span>
          <span>Required integrity collections always receive priority.</span>
        </div>

        {showCredentialEditor ? (
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

      <SectionCard eyebrow="Protected Collections" title="Collection orders Insight depends on">
        <p style={mutedCopy}>
          These collection orders protect the data foundation Insight needs to produce trustworthy operational intelligence.
        </p>

        <div style={profileGrid}>
          {COLLECTION_PROFILES.map((profile) => (
            <ProfileCard
              key={profile.type}
              title={profile.title}
              badge={profile.badge}
              tone={profile.tone}
              description={profile.description}
              reports={profile.reports}
              footer={profile.footer}
              onClick={() => setSelectedCollection(profile.type)}
            />
          ))}
        </div>
      </SectionCard>

      <SectionCard eyebrow="Schedule configuration" title="Automation cadence">
        <div style={twoCol}>
          {scheduleRowsToShow.map((row) => (
            <ScheduleEditor
              key={row.id}
              row={row}
              disabled={!props.canEdit}
              saving={savingScheduleKey === row.automation_type}
              onChange={updateScheduleRow}
              onSave={saveSchedule}
            />
          ))}
        </div>
      </SectionCard>

      <SectionCard eyebrow="Workday Refresh" title="Live data freshness">
        <div style={workdayRefreshCard}>
          <div>
            <p style={mutedCopy}>
              These saved presets prepare small all-day refresh tickets that keep operations current without getting in the way of larger collection work.
            </p>
            <div style={grid4}>
              <MiniStat label="Included Reports" value="DSW + FCC WA/SA" />
              <MiniStat label="Refresh Cadence" value={refreshCadenceLabel} />
              <MiniStat label="Refresh Window" value={refreshWindowLabel} />
              <MiniStat label="Priority" value="80" />
            </div>
          </div>

          <button
            type="button"
            className="button button-primary"
            disabled={!props.canEdit || queueingRequest === "OPERATIONS_FEED" || activeRefreshReports.length === 0}
            onClick={queueWorkdayRefreshRequest}
          >
            {queueingRequest === "OPERATIONS_FEED" ? "Preparing..." : "Prepare Refresh Ticket"}
          </button>
        </div>
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
        <div style={twoCol}>
          <RunSummary title="DSW" run={latestDswRun} />
          <RunSummary title="FCC" run={latestFccRun} />
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
    </section>
  );
}
