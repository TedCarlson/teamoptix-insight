import type React from "react";
import {
  normalizeExpressProgress,
  type ExpressDataHealth,
  type ExpressProgress,
} from "./expressProgress";

type ExpressProgressSignalProps = {
  progress: ExpressProgress;
  dataHealth?: Partial<ExpressDataHealth> | null;
  compact?: boolean;
  showLabel?: boolean;
  hideZeroSegments?: boolean;
  className?: string;
  style?: React.CSSProperties;
};

const segments = [
  { key: "complete", label: "Complete", short: "Comp", color: "#166534", background: "#ecfdf5" },
  { key: "attempted", label: "Attempted", short: "Att", color: "#6d28d9", background: "#f5f3ff" },
  { key: "open", label: "Open", short: "Open", color: "#c2410c", background: "#fff7ed" },
] as const;

export function ExpressProgressSignal({
  progress: rawProgress,
  dataHealth,
  compact = false,
  showLabel = true,
  hideZeroSegments = false,
  className,
  style,
}: ExpressProgressSignalProps) {
  const progress = normalizeExpressProgress(rawProgress);
  const referenceUnavailable = dataHealth?.referenceMatchAvailable === false;
  const identityMissing = Number(dataHealth?.trackingIdentityMissing ?? 0);
  const stopLinkMissing = Number(dataHealth?.stopLinkMissing ?? 0);
  const stopLinkAmbiguous = Number(dataHealth?.stopLinkAmbiguous ?? 0);
  const healthNote = [
    referenceUnavailable ? "All Codes matching unavailable" : null,
    identityMissing > 0 ? `${identityMissing} missing tracking ${identityMissing === 1 ? "identity" : "identities"}` : null,
    stopLinkMissing > 0 ? `${stopLinkMissing} missing stop ${stopLinkMissing === 1 ? "link" : "links"}` : null,
    stopLinkAmbiguous > 0 ? `${stopLinkAmbiguous} ambiguous stop ${stopLinkAmbiguous === 1 ? "link" : "links"}` : null,
  ].filter(Boolean).join(" · ");
  const title = `${progress.complete} Complete · ${progress.attempted} Attempted · ${progress.open} Open · ${progress.total} total${healthNote ? ` · ${healthNote}` : ""}`;
  const visibleSegments = hideZeroSegments
    ? segments.filter((segment) => progress[segment.key] > 0)
    : segments;

  return (
    <div
      className={className}
      title={title}
      data-express-progress="true"
      data-reference-match={referenceUnavailable ? "unavailable" : "available"}
      style={{
        minWidth: 0,
        border: `1px solid ${referenceUnavailable ? "#cbd5e1" : progress.open > 0 ? "#fdba74" : progress.attempted > 0 ? "#c4b5fd" : "#86efac"}`,
        borderRadius: 12,
        background: "#fff",
        padding: compact ? "5px 7px" : "7px 9px",
        display: "grid",
        gap: compact ? 4 : 6,
        ...style,
      }}
    >
      {showLabel ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span style={{ color: "#475569", fontSize: 9, fontWeight: 950, letterSpacing: "0.06em", textTransform: "uppercase" }}>
            Express
          </span>
          <span style={{ color: "#64748b", fontSize: 9, fontWeight: 900 }}>
            {progress.total} total
          </span>
        </div>
      ) : null}

      {visibleSegments.length > 0 ? (
        <div
          className="express-progress-signal__segments"
          style={{ display: "grid", gridTemplateColumns: `repeat(${visibleSegments.length}, minmax(0, 1fr))`, gap: 3 }}
        >
        {visibleSegments.map((segment) => (
          <div
            key={segment.key}
            style={{
              minWidth: 0,
              borderRadius: 8,
              background: segment.background,
              color: segment.color,
              padding: compact ? "4px 5px" : "5px 6px",
              display: "grid",
              gap: 1,
              textAlign: "center",
            }}
          >
            <span className="express-progress-signal__label" style={{ overflow: "hidden", textOverflow: "ellipsis", fontSize: compact ? 8 : 9, fontWeight: 900, textTransform: "uppercase" }}>
              {compact ? segment.short : segment.label}
            </span>
            <strong style={{ fontSize: compact ? 12 : 14, lineHeight: 1 }}>
              {progress[segment.key]}
            </strong>
          </div>
        ))}
        </div>
      ) : (
        <span style={{ color: referenceUnavailable ? "#b45309" : "#64748b", fontSize: compact ? 9 : 10, fontWeight: 850 }}>
          {referenceUnavailable ? "Express evidence unavailable" : "No Express volume"}
        </span>
      )}

      {healthNote && !compact ? (
        <span style={{ color: "#92400e", fontSize: 9, fontWeight: 800, lineHeight: 1.25 }}>
          {healthNote}
        </span>
      ) : null}
    </div>
  );
}
