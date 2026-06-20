"use client";

export type PayrollView = "attendance" | "summary" | "payroll-detail" | "row-detail";

export default function PayrollModeTabs({
  payrollView,
  setPayrollView,
}: {
  payrollView: PayrollView;
  setPayrollView: (view: PayrollView) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {(["attendance", "summary", "payroll-detail", "row-detail"] as const).map((view) => (
        <button
          key={view}
          type="button"
          className={payrollView === view ? "button button-primary" : "button"}
          onClick={() => setPayrollView(view)}
        >
          {view === "attendance"
            ? "Attendance"
            : view === "summary"
            ? "Summary"
            : view === "payroll-detail"
            ? "Payroll Detail"
            : "Row Detail"}
        </button>
      ))}
    </div>
  );
}
