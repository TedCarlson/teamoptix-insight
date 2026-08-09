"use client";

import { useOperationsCollectionSignal } from "@/features/operations/workspace/useOperationsCollectionSignal";

type OperationsWorkspaceToolbarProps = {
  slug: string;
  statusText?: string;
  statusTone?: "active" | "waiting" | "neutral";
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
    useOperationsCollectionSignal(slug);
  const renderedStatusText =
    authoritativeSignal?.copy ?? statusText ?? "Loading collection status…";
  const renderedStatusTone = authoritativeSignal
    ? authoritativeSignal.active
      ? "active"
      : "waiting"
    : statusTone;

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
      <span
        className={`operations-workspace-toolbar__status${renderedStatusText ? ` has-signal is-${renderedStatusTone}` : ""}`}
        style={{ color: "#64748b", fontSize: 12, fontWeight: 800 }}
      >
        {renderedStatusText}
      </span>

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
