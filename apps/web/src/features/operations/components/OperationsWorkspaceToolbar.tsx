"use client";

type OperationsWorkspaceToolbarProps = {
  lastUpdatedAt: string | null;
  refreshing?: boolean;
  onRefresh: () => void;
  onUpload: () => void;
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
  const { lastUpdatedAt, refreshing = false, onRefresh, onUpload } = props;

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 10,
        alignItems: "center",
        marginBottom: 10,
      }}
    >
      <span style={{ color: "#64748b", fontSize: 12, fontWeight: 800 }}>
        Last updated {formatLastUpdated(lastUpdatedAt)}
      </span>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          className="button"
          onClick={onRefresh}
          disabled={refreshing}
          style={{ minHeight: 30, padding: "0 10px", fontSize: 12 }}
        >
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>

        <button
          type="button"
          className="button button-primary"
          onClick={onUpload}
          style={{ minHeight: 30, padding: "0 10px", fontSize: 12 }}
        >
          Upload Report
        </button>
      </div>
    </div>
  );
}
