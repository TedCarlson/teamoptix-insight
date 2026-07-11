"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import type { DispatchEventRow } from "@/features/dispatch/lib/dispatchSupport";
import type { RosterRow } from "@/features/people/types/roster.types";

import type {
  AttendanceRow,
  PayrollSummaryRow,
  PayrollActivityRow,
  PayrollMetrics,
} from "@/features/payroll/lib/payroll.types";
import { money } from "@/features/payroll/lib/payroll.format";
import { buildPayrollSummaryGroups } from "@/features/payroll/lib/payroll.summary";
import {
  buildPayrollDriverDayDetails,
  buildPayrollRowDetails,
  buildPayrollSummaryFromDriverDayDetails,
} from "@/features/payroll/lib/payroll.detail";
import { buildAttendanceRows } from "@/features/payroll/lib/payroll.attendance";
import ReportDayPills from "@/features/payroll/components/ReportDayPills";
import PayrollSummaryTable from "@/features/payroll/components/PayrollSummaryTable";
import PayrollWeekControls from "@/features/payroll/components/PayrollWeekControls";
import PayrollAttendanceTable from "@/features/payroll/components/PayrollAttendanceTable";
import PayrollRowDetailTable from "@/features/payroll/components/PayrollRowDetailTable";
import PayrollDetailTable from "@/features/payroll/components/PayrollDetailTable";
import PayrollDswAliasTool from "@/features/payroll/components/PayrollDswAliasTool";
import PayrollReportEmailDialog from "@/features/payroll/components/PayrollReportEmailDialog";
import PayrollAdjustmentsPanel from "@/features/payroll/components/PayrollAdjustmentsPanel";

import {
  addDays,
  defaultPayrollWeekEndFriday,
  weekDaysForEnd,
} from "@/features/payroll/lib/payroll.date";













export type PayrollView = "attendance" | "summary" | "payroll-detail" | "row-detail" | "adjustments";





























export default function PayrollGrid({ view, viewPicker }: { view?: PayrollView; viewPicker?: React.ReactNode }) {
  const params = useParams();
  const slug = String(params?.slug ?? "");

  const [weekEnd, setWeekEnd] = useState(defaultPayrollWeekEndFriday);
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [eventsByDay, setEventsByDay] = useState<Record<string, DispatchEventRow[]>>({});
  const [payrollMetrics, setPayrollMetrics] = useState<PayrollMetrics | null>(null);
  const [internalPayrollView, setPayrollView] = useState<PayrollView>("summary");
  const payrollView = view ?? internalPayrollView;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rebuilding, setRebuilding] = useState(false);
  const [aliasOpen, setAliasOpen] = useState(false);
  const [aliasCount, setAliasCount] = useState(0);
  const [reportEmailOpen, setReportEmailOpen] = useState(false);

  const days = useMemo(() => weekDaysForEnd(weekEnd), [weekEnd]);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const rosterRes = await fetch(`/api/company/${slug}/people/roster`, {
          credentials: "include",
          cache: "no-store",
        });

        const rosterData = await rosterRes.json();

        if (!rosterRes.ok) {
          throw new Error(rosterData?.error ?? "Failed to load roster.");
        }

        const [dispatchPayloads, payrollRes] = await Promise.all([
          Promise.all(
            days.map(async (day) => {
              const res = await fetch(`/api/company/${slug}/dispatch/day?date=${day}`, {
                credentials: "include",
                cache: "no-store",
              });

              const data = await res.json();
              if (!res.ok) throw new Error(data?.error ?? `Failed to load dispatch day ${day}.`);

              return [day, (data?.events ?? []) as DispatchEventRow[]] as const;
            })
          ),
          fetch(`/api/company/${slug}/payroll/activity?weekEnd=${weekEnd}`, {
            credentials: "include",
            cache: "no-store",
          }),
        ]);

        const payrollData = await payrollRes.json();

        if (!payrollRes.ok) {
          throw new Error(payrollData?.error ?? "Failed to load payroll metrics.");
        }

        if (!active) return;

        setRoster((rosterData?.roster ?? []) as RosterRow[]);
        setEventsByDay(Object.fromEntries(dispatchPayloads));
        const summary = ((payrollData?.summary ?? []) as PayrollSummaryRow[])
          .map((row) => ({
            roster_member_id: row.roster_member_id ?? null,
            person_name: row.person_name,
            days_worked: Number(row.days_worked ?? 0),
            worked_days: Array.isArray(row.worked_days) ? row.worked_days : [],
            daily_pay_total: Number(row.daily_pay_total ?? 0),
            threshold_pay_total: Number(row.threshold_pay_total ?? 0),
            adjustment_total: Number(row.adjustment_total ?? 0),
            estimated_total: Number(row.estimated_total ?? 0),
          }))
          .sort((a, b) => a.person_name.localeCompare(b.person_name));

        setPayrollMetrics({
          record_count: Number(payrollData?.record_count ?? 0),
          payable_days: summary.reduce((sum, row) => sum + row.days_worked, 0),
          estimated_payroll: Number(payrollData?.estimated_payroll ?? 0),
          estimated_threshold_pay: Number(payrollData?.estimated_threshold_pay ?? 0),
          summary,
          activity: ((payrollData?.activity ?? []) as PayrollActivityRow[]),
        });
      } catch (err) {
        if (!active) return;
        setRoster([]);
        setEventsByDay({});
        setPayrollMetrics(null);
        setError(err instanceof Error ? err.message : "Failed to load payroll attendance.");
      } finally {
        if (active) setLoading(false);
      }
    }

    if (slug) void load();

    return () => {
      active = false;
    };
  }, [slug, days, weekEnd]);

  
  useEffect(() => {
    let active = true;

    async function loadAliasCount() {
      if (!slug || !weekEnd) return;

      try {
        const res = await fetch(`/api/company/${slug}/payroll/dsw-unmatched?weekEnd=${weekEnd}`, {
          credentials: "include",
          cache: "no-store",
        });

        const data = await res.json();

        if (!active) return;

        if (!res.ok) {
          setAliasCount(0);
          return;
        }

        setAliasCount(Array.isArray(data?.unmatched) ? data.unmatched.length : 0);
      } catch {
        if (active) setAliasCount(0);
      }
    }

    void loadAliasCount();

    return () => {
      active = false;
    };
  }, [slug, weekEnd, payrollMetrics?.activity]);

  async function rebuildPayrollActivity() {
    try {
      setRebuilding(true);

      const res = await fetch(
        `/api/company/${slug}/payroll/rebuild`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            startDate: addDays(weekEnd, -6),
            endDate: weekEnd,
          }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error ?? "Payroll rebuild failed.");
      }

      window.location.reload();
    } catch (err) {
      alert(
        err instanceof Error
          ? err.message
          : "Payroll rebuild failed."
      );
    } finally {
      setRebuilding(false);
    }
  }

  const attendanceRows = useMemo(
    () =>
      buildAttendanceRows({
        roster,
        days,
        eventsByDay,
        payrollActivity: payrollMetrics?.activity ?? [],
      }),
    [days, eventsByDay, payrollMetrics?.activity, roster]
  );

  const presentCount = attendanceRows.reduce(
    (sum, row) => sum + Object.values(row.days).filter((cell) => cell.present).length,
    0
  );

  const rosterById = useMemo(() => {
    return new Map(roster.map((person) => [person.roster_member_id, person]));
  }, [roster]);

  const detailRows = useMemo(
    () => buildPayrollRowDetails(payrollMetrics?.activity ?? []),
    [payrollMetrics?.activity]
  );

  const payrollDetailRows = useMemo(
    () => buildPayrollDriverDayDetails(payrollMetrics?.activity ?? []),
    [payrollMetrics?.activity]
  );

  // Payroll Summary is a rollup of the exact normalized rows shown in
  // Payroll Detail. There is no independent client-visible calculation path.
  const reconciledSummaryRows = useMemo(
    () => buildPayrollSummaryFromDriverDayDetails(payrollDetailRows),
    [payrollDetailRows]
  );

  const groupedSummaryRows = useMemo(
    () => buildPayrollSummaryGroups(reconciledSummaryRows, rosterById),
    [reconciledSummaryRows, rosterById]
  );

  const estimatedPayroll = useMemo(
    () =>
      reconciledSummaryRows.reduce(
        (sum, row) => sum + Number(row.estimated_total ?? 0),
        0
      ),
    [reconciledSummaryRows]
  );

  const estimatedThresholdPay = useMemo(
    () =>
      reconciledSummaryRows.reduce(
        (sum, row) => sum + Number(row.threshold_pay_total ?? 0),
        0
      ),
    [reconciledSummaryRows]
  );

  const estimatedAdjustmentPay = useMemo(
    () =>
      reconciledSummaryRows.reduce(
        (sum, row) => sum + Number(row.adjustment_total ?? 0),
        0
      ),
    [reconciledSummaryRows]
  );

  const payrollViewTitle =
    payrollView === "attendance"
      ? "Attendance Review"
      : payrollView === "summary"
        ? "Summary"
        : payrollView === "payroll-detail"
          ? "Payroll Detail"
          : payrollView === "row-detail"
            ? "Row Detail"
            : "Adjustments";

  return (
    <section className="payroll-workspace">
        <div className="payroll-workspace-toolbar">
          <div>
            <p className="value-card__eyebrow">Payroll</p>
            <h2 className="app-card__title">{payrollViewTitle}</h2>
          </div>

          <div className="payroll-workspace-toolbar__actions">
            {viewPicker ?? (!view ? (
              <div className="workspace-view-picker">
                <span>View</span>
                <select
                  className="workspace-select"
                  value={payrollView}
                  onChange={(event) => setPayrollView(event.target.value as PayrollView)}
                >
                  <option value="summary">Summary</option>
                  <option value="adjustments">Adjustments</option>
                  <option value="payroll-detail">Payroll Detail</option>
                  <option value="row-detail">Row Detail</option>
                </select>
              </div>
            ) : null)}

            <PayrollWeekControls
              weekEnd={weekEnd}
              setWeekEnd={setWeekEnd}
              rebuilding={rebuilding}
              onRebuild={rebuildPayrollActivity}
            />

            <button
              type="button"
              className="button payroll-action-button"
              onClick={rebuildPayrollActivity}
              disabled={rebuilding}
            >
              <span aria-hidden="true">⟳</span>
              {rebuilding ? "Rebuilding..." : "Rebuild"}
            </button>

            <button type="button" className="button payroll-action-button" onClick={() => setReportEmailOpen(true)}>
              <span aria-hidden="true">✉</span>
              Send Report
            </button>

            <button type="button" className="button payroll-action-button" onClick={() => setAliasOpen(true)}>
              Alias Review{aliasCount > 0 ? ` (${aliasCount})` : ""}
            </button>
          </div>
        </div>

        <div
          style={{
            border: "1px solid #e6edf5",
            borderRadius: 14,
            padding: 10,
            background: "#f8fafc",
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            color: "#334155",
            fontSize: 13,
            fontWeight: 850,
          }}
        >
          <span>Week Ending Friday: {weekEnd}</span>
          <span>
            {reconciledSummaryRows.length} records · Estimated payroll{" "}
            {money(estimatedPayroll)} · Estimated threshold pay{" "}
            {money(estimatedThresholdPay)} · Adjustments{" "}
            {money(estimatedAdjustmentPay)}
          </span>
          {payrollView === "attendance" ? (
            <span>✓ Present · C Call-out · N No Show · — No signal</span>
          ) : (
            <ReportDayPills days={days} activity={payrollMetrics?.activity ?? []} />
          )}
        </div>

        {error ? (
          <div style={{ color: "#991b1b", fontWeight: 800 }}>{error}</div>
        ) : null}

        {loading ? (
          <div className="muted">Loading attendance...</div>
        ) : payrollView === "summary" ? (
          <PayrollSummaryTable groupedSummaryRows={groupedSummaryRows} />
        ) : payrollView === "payroll-detail" ? (
          <PayrollDetailTable rows={payrollDetailRows} days={days} />
        ) : payrollView === "row-detail" ? (
          <PayrollRowDetailTable detailRows={detailRows} />
        ) : payrollView === "adjustments" ? (
          <PayrollAdjustmentsPanel
            slug={slug}
            weekEnd={weekEnd}
            roster={roster}
            onChanged={() => undefined}
          />
        ) : (
          <PayrollAttendanceTable
            attendanceRows={attendanceRows}
            days={days}
          />
        )}
      <PayrollReportEmailDialog
        open={reportEmailOpen}
        slug={slug}
        weekEnd={weekEnd}
        summary={reconciledSummaryRows}
        groupedSummaryRows={groupedSummaryRows}
        onClose={() => setReportEmailOpen(false)}
      />

      {aliasOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(15,23,42,.42)",
            display: "grid",
            placeItems: "center",
            padding: 24,
          }}
          onClick={() => setAliasOpen(false)}
        >
          <div
            style={{
              width: "min(980px, 96vw)",
              maxHeight: "86vh",
              overflow: "auto",
              background: "#fff",
              borderRadius: 16,
              boxShadow: "0 24px 80px rgba(15,23,42,.28)",
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ padding: 12, borderBottom: "1px solid #e6edf5", display: "flex", justifyContent: "space-between" }}>
              <strong>DSW Alias Review</strong>
              <button type="button" className="button" onClick={() => setAliasOpen(false)}>Close</button>
            </div>
            <PayrollDswAliasTool slug={slug} weekEnd={weekEnd} />
          </div>
        </div>
      ) : null}

    </section>
  );
}
