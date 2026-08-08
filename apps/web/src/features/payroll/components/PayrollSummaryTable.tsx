"use client";

import { useEffect, useState } from "react";
import type {
  PayrollSummaryRow,
  PayrollWorkDayKind,
} from "@/features/payroll/lib/payroll.types";
import { money } from "@/features/payroll/lib/payroll.format";
import {
  compactDayCode,
} from "@/features/payroll/lib/payroll.date";

function WorkedDaysCell({ row }: { row: PayrollSummaryRow }) {
  const workedDays = row.worked_days ?? [];

  if (workedDays.length === 0) {
    return <>{row.days_worked}</>;
  }

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: 3,
        whiteSpace: "nowrap",
      }}
    >
      <span>{row.days_worked} ·</span>
      {workedDays.map((serviceDate) => {
        const kind = row.worked_day_kinds?.[serviceDate] ?? null;

        return (
          <DayToken
            key={serviceDate}
            code={compactDayCode(serviceDate)}
            kind={kind}
          />
        );
      })}
    </span>
  );
}

function DayToken({
  code,
  kind,
}: {
  code: string;
  kind: PayrollWorkDayKind | null;
}) {
  if (!kind) {
    return <span>{code}</span>;
  }

  const title =
    kind === "TRAINING"
      ? "Training day"
      : kind === "WALK_ON"
        ? "Walk-on day"
        : "Helper day";

  return (
    <span
      title={title}
      aria-label={`${code}: ${title}`}
      style={{
        display: "inline-flex",
        minWidth: 18,
        height: 18,
        padding: "0 5px",
        alignItems: "center",
        justifyContent: "center",
        border: "1px solid #86efac",
        borderRadius: 999,
        background: "#f0fdf4",
        color: "#166534",
        fontSize: 11,
        fontWeight: 950,
        lineHeight: 1,
        cursor: "help",
      }}
    >
      {code}
    </span>
  );
}


const thStyle = {
  position: "sticky" as const,
  top: 0,
  background: "#f8fafc",
  borderBottom: "1px solid #e6edf5",
  padding: "9px 10px",
  color: "#64748b",
  fontSize: 11,
  fontWeight: 950,
  textTransform: "uppercase" as const,
  letterSpacing: "0.05em",
  textAlign: "left" as const,
};

const tdStyle = {
  borderBottom: "1px solid #eef2f7",
  padding: "9px 10px",
  color: "#334155",
  fontSize: 13,
};

function PayrollMemoCell({
  row,
  onSave,
}: {
  row: PayrollSummaryRow;
  onSave: (rosterMemberId: string, memo: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(row.memo ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(row.memo ?? "");
  }, [row.memo]);

  const changed = draft.trim() !== (row.memo ?? "").trim();

  async function save() {
    if (!row.roster_member_id || !changed) return;

    try {
      setSaving(true);
      setError(null);
      await onSave(row.roster_member_id, draft.trim());
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Failed to save memo."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 4, minWidth: 220 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input
          value={draft}
          maxLength={2000}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void save();
            }
          }}
          placeholder="Add payroll memo"
          aria-label={`Payroll memo for ${row.person_name}`}
          style={{
            width: "100%",
            minWidth: 0,
            height: 34,
            border: "1px solid #d6dfeb",
            borderRadius: 9,
            padding: "0 9px",
            color: "#334155",
            font: "inherit",
          }}
        />
        <button
          type="button"
          onClick={() => void save()}
          disabled={!changed || saving || !row.roster_member_id}
          title={draft.trim() ? "Save payroll memo" : "Clear payroll memo"}
          style={{
            height: 34,
            padding: "0 10px",
            border: "1px solid #cbd5e1",
            borderRadius: 9,
            background: changed ? "#eff6ff" : "#f8fafc",
            color: changed ? "#1d4ed8" : "#94a3b8",
            fontWeight: 850,
            cursor: changed && !saving ? "pointer" : "default",
          }}
        >
          {saving ? "Saving" : "Save"}
        </button>
      </div>
      {error ? (
        <span style={{ color: "#991b1b", fontSize: 11, fontWeight: 750 }}>
          {error}
        </span>
      ) : null}
    </div>
  );
}

export default function PayrollSummaryTable({
  groupedSummaryRows,
  onSaveMemo,
}: {
  groupedSummaryRows: {
    group: string;
    rows: PayrollSummaryRow[];
  }[];
  onSaveMemo: (rosterMemberId: string, memo: string) => Promise<void>;
}) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 1040 }}>
        <thead>
          <tr>
            <th style={thStyle}>Employee</th>
            <th style={thStyle}>Memo</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Days Worked</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Base Pay</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Threshold Pay</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Adjustments</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Total Earnings</th>
          </tr>
        </thead>
        <tbody>
          {groupedSummaryRows.length === 0 ? (
            <tr>
              <td colSpan={7} style={{ padding: 16, color: "#64748b", fontWeight: 800 }}>
                No payroll activity found for this week.
              </td>
            </tr>
          ) : (
            groupedSummaryRows.flatMap(({ group, rows }) => [
              <tr key={`group-${group}`}>
                <td
                  colSpan={7}
                  style={{
                    ...tdStyle,
                    background: "#f8fafc",
                    color: "#64748b",
                    fontSize: 11,
                    fontWeight: 950,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  {group}
                </td>
              </tr>,
              ...rows.map((row, rowIndex) => (
                <tr key={`${group}-${row.roster_member_id ?? row.person_name}-${rowIndex}`}>
                  <td style={tdStyle}><strong>{row.person_name}</strong></td>
                  <td style={tdStyle}>
                    <PayrollMemoCell row={row} onSave={onSaveMemo} />
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>
                    <WorkedDaysCell row={row} />
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>
                    {money(row.daily_pay_total)}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>
                    {money(row.threshold_pay_total)}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>
                    {money(row.adjustment_total ?? 0)}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right", fontWeight: 950 }}>
                    {money(row.estimated_total)}
                  </td>
                </tr>
              )),
            ])
          )}
        </tbody>
      </table>
    </div>
  );
}
