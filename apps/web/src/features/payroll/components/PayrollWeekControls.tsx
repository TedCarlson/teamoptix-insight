"use client";

import { addDays, weekRangeLabel } from "@/features/payroll/lib/payroll.date";

export default function PayrollWeekControls({
  weekEnd,
  setWeekEnd,
  rebuilding,
  onRebuild,
}: {
  weekEnd: string;
  setWeekEnd: (value: string) => void;
  rebuilding: boolean;
  onRebuild: () => void;
}) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <div
        style={{
          display: "inline-grid",
          gap: 4,
          minWidth: 260,
        }}
      >
        <span className="context-stat__label">Week Scope</span>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "72px minmax(150px, 1fr) 72px",
            alignItems: "center",
            border: "1px solid #d7e2ee",
            borderRadius: 10,
            overflow: "hidden",
            background: "#f8fafc",
          }}
        >
          <button
            className="button"
            type="button"
            onClick={() => setWeekEnd(addDays(weekEnd, -7))}
            style={{ border: 0, borderRadius: 0, boxShadow: "none" }}
          >
            Prev
          </button>
          <strong
            style={{
              textAlign: "center",
              color: "#64748b",
              fontSize: 13,
              padding: "0 16px",
              whiteSpace: "nowrap",
              borderLeft: "1px solid #e6edf5",
              borderRight: "1px solid #e6edf5",
              minHeight: 42,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {weekRangeLabel(weekEnd)}
          </strong>
          <button
            className="button"
            type="button"
            onClick={() => setWeekEnd(addDays(weekEnd, 7))}
            style={{ border: 0, borderRadius: 0, boxShadow: "none" }}
          >
            Next
          </button>
        </div>
      </div>

      <button
        type="button"
        className="button"
        onClick={onRebuild}
        disabled={rebuilding}
        style={{
          padding: "8px 14px",
          minHeight: 38,
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 850,
          whiteSpace: "nowrap",
          alignSelf: "end",
        }}
      >
        {rebuilding ? "Rebuilding..." : "Rebuild"}
      </button>
    </div>
  );
}
