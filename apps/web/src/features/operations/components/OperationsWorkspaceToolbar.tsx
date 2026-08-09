"use client";

type OperationsWorkspaceToolbarProps = {
  lastUpdatedAt: string | null;
  statusText?: string;
  statusTone?: "active" | "waiting" | "neutral";
  refreshing?: boolean;
  onRefresh: () => void;
  onUpload?: () => void;
  actions?: React.ReactNode;
};

function formatLastUpdated(value: string | null) {
  if (!value) return "Not refreshed yet";

  try {
    return new Date(value).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

export default function OperationsWorkspaceToolbar(props: OperationsWorkspaceToolbarProps) {
  const {
    lastUpdatedAt,
    statusText,
    statusTone = "neutral",
    refreshing = false,
    onRefresh,
    onUpload,
    actions,
  } = props;

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
        className={`operations-workspace-toolbar__status${statusText ? ` has-signal is-${statusTone}` : ""}`}
        style={{ color: "#64748b", fontSize: 12, fontWeight: 800 }}
      >
        {statusText ?? `Last updated ${formatLastUpdated(lastUpdatedAt)}`}
      </span>

      <div className="operations-workspace-toolbar__actions operations-action-rail__actions" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {actions}
        <button
          type="button"
          className="button"
          onClick={onRefresh}
          disabled={refreshing}
          style={{ minHeight: 30, padding: "0 10px", fontSize: 12 }}
        >
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>

        {onUpload ? (
          <button
            type="button"
            className="button button-primary"
            onClick={onUpload}
            style={{ minHeight: 30, padding: "0 10px", fontSize: 12 }}
          >
            Upload Report
          </button>
        ) : null}
      </div>
    </div>
  );
}
