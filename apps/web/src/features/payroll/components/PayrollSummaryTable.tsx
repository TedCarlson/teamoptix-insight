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
    <span className="payroll-summary-table__worked-days">
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
      className="payroll-summary-table__day-token"
      title={title}
      aria-label={`${code}: ${title}`}
    >
      {code}
    </span>
  );
}


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
    <div className="payroll-summary-table__memo-field">
      <div className="payroll-summary-table__memo-control">
        <input
          className="payroll-summary-table__memo-input"
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
        />
        <button
          type="button"
          className={`payroll-summary-table__memo-save${changed ? " is-changed" : ""}`}
          onClick={() => void save()}
          disabled={!changed || saving || !row.roster_member_id}
          title={draft.trim() ? "Save payroll memo" : "Clear payroll memo"}
        >
          {saving ? "Saving" : "Save"}
        </button>
      </div>
      {error ? (
        <span className="payroll-summary-table__memo-error">
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
    <div className="payroll-summary-table-wrap">
      <table className="payroll-summary-table">
        <thead>
          <tr>
            <th>Employee</th>
            <th>Memo</th>
            <th className="is-numeric">Days Worked</th>
            <th className="is-numeric">Base Pay</th>
            <th className="is-numeric">Threshold Pay</th>
            <th className="is-numeric">Adjustments</th>
            <th className="is-numeric">Total Earnings</th>
          </tr>
        </thead>
        <tbody>
          {groupedSummaryRows.length === 0 ? (
            <tr>
              <td className="payroll-summary-table__empty" colSpan={7}>
                No payroll activity found for this week.
              </td>
            </tr>
          ) : (
            groupedSummaryRows.flatMap(({ group, rows }) => [
              <tr className="payroll-summary-table__group" key={`group-${group}`}>
                <td
                  colSpan={7}
                >
                  {group}
                </td>
              </tr>,
              ...rows.map((row, rowIndex) => (
                <tr className="payroll-summary-table__row" key={`${group}-${row.roster_member_id ?? row.person_name}-${rowIndex}`}>
                  <td><strong>{row.person_name}</strong></td>
                  <td>
                    <PayrollMemoCell row={row} onSave={onSaveMemo} />
                  </td>
                  <td className="is-numeric">
                    <WorkedDaysCell row={row} />
                  </td>
                  <td className="is-numeric">
                    {money(row.daily_pay_total)}
                  </td>
                  <td className="is-numeric">
                    {money(row.threshold_pay_total)}
                  </td>
                  <td className="is-numeric">
                    {money(row.adjustment_total ?? 0)}
                  </td>
                  <td className="is-numeric is-total">
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
