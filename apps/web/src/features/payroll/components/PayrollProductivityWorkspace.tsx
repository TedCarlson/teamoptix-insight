"use client";

import { useState } from "react";
import PayrollGrid, { type PayrollView } from "@/features/payroll/components/PayrollGrid";

type ProductivityView = Extract<PayrollView, "payroll-detail" | "row-detail">;

type PayrollProductivityWorkspaceProps = {
  slug: string;
  weekEnd: string;
  setWeekEnd: (value: string) => void;
};

export default function PayrollProductivityWorkspace({
  slug,
  weekEnd,
  setWeekEnd,
}: PayrollProductivityWorkspaceProps) {
  const [view, setView] = useState<ProductivityView>("payroll-detail");

  return (
    <PayrollGrid
      slug={slug}
      weekEnd={weekEnd}
      setWeekEnd={setWeekEnd}
      view={view}
      viewPicker={
        <div className="workspace-view-picker">
          <span>View</span>
          <select
            className="workspace-select"
            value={view}
            onChange={(event) => setView(event.target.value as ProductivityView)}
          >
            <option value="payroll-detail">Payroll Detail</option>
            <option value="row-detail">Row Detail</option>
          </select>
        </div>
      }
    />
  );
}
