"use client";

export default function PayrollHeader() {
  return (
    <div style={{ display: "grid", gap: 2 }}>
      <p className="workspace-eyebrow" style={{ margin: 0 }}>Payroll</p>
      <h2 style={{ margin: 0, fontSize: 22, lineHeight: 1.15 }}>
        Payroll Review
      </h2>
      <p className="workspace-card-body" style={{ margin: 0 }}>
        Review attendance, payroll detail, and summary totals for the selected week.
      </p>
    </div>
  );
}
