"use client";

import { useState } from "react";
import PayrollGrid, { type PayrollView } from "@/features/payroll/components/PayrollGrid";

type ProductivityView = Extract<PayrollView, "payroll-detail" | "row-detail">;

export default function PayrollProductivityWorkspace() {
  const [view, setView] = useState<ProductivityView>("payroll-detail");

  return (
    <PayrollGrid
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
