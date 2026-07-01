"use client";

import { useState } from "react";
import PayrollGrid from "@/features/payroll/components/PayrollGrid";

type PayrollWorkspaceView = "payroll" | "time-tracking";

function viewLabel(view: PayrollWorkspaceView) {
  if (view === "time-tracking") return "Time Tracking";
  return "Payroll";
}

export default function PayrollWorkspace() {
  const [view, setView] = useState<PayrollWorkspaceView>("payroll");

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
        <article className="value-card">
          <p className="value-card__eyebrow">Time Tracking</p>
          <h3 className="value-card__title">Workspace shell ready</h3>
          <p style={{ margin: 0, color: "#64748b" }}>
            Overview, Time Sheet, Duty Hours, and DOT Hours will mount here.
          </p>
        </article>
      ) : null}
    </section>
  );
}
