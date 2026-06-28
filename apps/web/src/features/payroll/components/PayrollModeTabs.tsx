"use client";

export type PayrollView =
  | "attendance"
  | "summary"
  | "payroll-detail"
  | "row-detail"
  | "adjustments";

export default function PayrollModeTabs({
  payrollView,
  setPayrollView,
}: {
  payrollView: PayrollView;
  setPayrollView: (view: PayrollView) => void;
}) {
  const views: PayrollView[] = [
    "attendance",
    "summary",
    "payroll-detail",
    "row-detail",
    "adjustments",
  ];

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {views.map((view) => (
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
                : view === "row-detail"
                  ? "Row Detail"
                  : "Adjustments"}
        </button>
      ))}
    </div>
  );
}
