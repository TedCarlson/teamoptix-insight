"use client";

import { useState } from "react";
import PayrollGrid from "@/features/payroll/components/PayrollGrid";
import { PayrollTimeKeepingPage } from "@/features/payroll/components/PayrollTimeKeepingPage";
import { defaultPayrollWeekEndFriday } from "@/features/payroll/lib/payroll.date";

type PayrollWorkspaceView = "payroll" | "time-tracking";

function viewLabel(view: PayrollWorkspaceView) {
  if (view === "time-tracking") return "Time Tracking";
  return "Payroll";
}

type PayrollWorkspaceProps = {
  slug: string;
};

export default function PayrollWorkspace({ slug }: PayrollWorkspaceProps) {
  const [view, setView] = useState<PayrollWorkspaceView>("payroll");
  const [weekEnd] = useState(defaultPayrollWeekEndFriday);

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <div>
          <p className="value-card__eyebrow">Workspace</p>
          <h2 style={{ margin: 0 }}>{viewLabel(view)}</h2>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            className={view === "payroll" ? "button button-primary" : "button"}
            onClick={() => setView("payroll")}
          >
            Payroll
          </button>
          <button
            type="button"
            className={view === "time-tracking" ? "button button-primary" : "button"}
            onClick={() => setView("time-tracking")}
          >
            Time Tracking
          </button>
        </div>
      </div>

      {view === "payroll" ? <PayrollGrid /> : null}

      {view === "time-tracking" ? (
        <PayrollTimeKeepingPage slug={slug} weekEnd={weekEnd} />
      ) : null}
    </section>
  );
}
