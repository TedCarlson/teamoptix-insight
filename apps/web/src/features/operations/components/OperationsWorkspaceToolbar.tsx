"use client";

import { useOperationsCollectionSignal } from "@/features/operations/workspace/useOperationsCollectionSignal";
import type { OperationsCollectionSignal } from "@/features/operations/workspace/operationsCollectionSignal";

type OperationsWorkspaceToolbarProps = {
  slug: string;
  collectionSignal?: OperationsCollectionSignal;
  statusText?: string;
  statusTone?: "active" | "waiting" | "critical" | "neutral";
  refreshing?: boolean;
  onRefresh: () => void;
  onUpload?: () => void;
  onActions?: () => void;
  actionsLabel?: string;
  onComplianceReport?: () => void;
  onExpressReport?: () => void;
  onAttendance?: () => void;
  attendanceLabel?: string;
  actions?: React.ReactNode;
};

export default function OperationsWorkspaceToolbar(props: OperationsWorkspaceToolbarProps) {
  const {
    slug,
    collectionSignal,
    statusText,
    statusTone = "neutral",
    refreshing = false,
    onRefresh,
    onUpload,
    onActions,
    actionsLabel = "Actions",
    onComplianceReport,
    onExpressReport,
    onAttendance,
    attendanceLabel = "Attendance",
    actions,
  } = props;
  const { signal: authoritativeSignal, refresh: refreshCollectionSignal } =
    useOperationsCollectionSignal(slug, !collectionSignal);
  const renderedSignal = collectionSignal ?? authoritativeSignal;

  function refreshAll() {
    void refreshCollectionSignal();
    onRefresh();
  }

  return (
    <div
      className="operations-workspace-toolbar operations-action-rail"
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 10,
        alignItems: "center",
        marginBottom: 10,
      }}
    >
      {renderedSignal ? (
        <details className="operations-status-popover">
          <summary
            className={`operations-status-popover__trigger is-${renderedSignal.collection.tone}`}
            aria-label={`Open status details. Collection ${renderedSignal.collection.value}`}
            title={`Collection ${renderedSignal.collection.value}`}
          >
            <span>Status</span>
          </summary>
          <div
            className="operations-status-popover__panel"
            aria-label="Collection and ingestion status"
          >
            {[
              renderedSignal.collection,
              renderedSignal.activity,
              renderedSignal.ingestion,
            ].map((signal) => (
              <div
                key={signal.key}
                className={`operations-status-popover__signal is-${signal.tone}`}
              >
                <span>{signal.label}</span>
                <strong>{signal.value}</strong>
                <small>{signal.detail}</small>
              </div>
            ))}
          </div>
        </details>
      ) : (
        <span
          className={`operations-workspace-toolbar__status${statusText ? ` has-signal is-${statusTone}` : ""}`}
          style={{ color: "#64748b", fontSize: 12, fontWeight: 800 }}
        >
          {statusText ?? "Loading collection status…"}
        </span>
      )}

      <div className="operations-workspace-toolbar__actions operations-action-rail__actions" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {onActions ? (
          <button
            type="button"
            className="button operations-action-rail__primary"
            onClick={onActions}
          >
            {actionsLabel}
          </button>
        ) : null}
        {onComplianceReport ? (
          <button type="button" className="button" onClick={onComplianceReport}>
            Compliance Report
          </button>
        ) : null}
        {onExpressReport ? (
          <button type="button" className="button" onClick={onExpressReport}>
            Express Report
          </button>
        ) : null}
        {onAttendance ? (
          <button type="button" className="button" onClick={onAttendance}>
            {attendanceLabel}
          </button>
        ) : null}
        {actions}
        <button
          type="button"
          className="button"
          onClick={refreshAll}
          disabled={refreshing}
        >
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>

        {onUpload ? (
          <button
            type="button"
            className="button button-primary"
            onClick={onUpload}
          >
            Upload Report
          </button>
        ) : null}
      </div>
    </div>
  );
}
