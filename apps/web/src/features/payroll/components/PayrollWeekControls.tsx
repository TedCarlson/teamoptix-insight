"use client";

import { addDays, weekRangeLabel } from "@/features/payroll/lib/payroll.date";

export default function PayrollWeekControls({
  weekEnd,
  setWeekEnd,
}: {
  weekEnd: string;
  setWeekEnd: (value: string) => void;
  rebuilding: boolean;
  onRebuild: () => void;
}) {
  return (
    <div className="payroll-week-control">
      <button
        className="payroll-week-control__button"
        type="button"
        onClick={() => setWeekEnd(addDays(weekEnd, -7))}
      >
        <span aria-hidden="true">‹</span>
        Prev
      </button>

      <strong className="payroll-week-control__range">
        {weekRangeLabel(weekEnd)}
      </strong>

      <button
        className="payroll-week-control__button"
        type="button"
        onClick={() => setWeekEnd(addDays(weekEnd, 7))}
      >
        Next
        <span aria-hidden="true">›</span>
      </button>
    </div>
  );
}
