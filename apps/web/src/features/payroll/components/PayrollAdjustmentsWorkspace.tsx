"use client";

import { useState } from "react";
import type { RosterRow } from "@/features/people/types/roster.types";
import PayrollAdjustmentsPanel from "@/features/payroll/components/PayrollAdjustmentsPanel";
import PayrollWorkEventsPanel from "@/features/payroll/components/PayrollWorkEventsPanel";

type AdjustmentMode = "work-evidence" | "pay-adjustment";

type Props = {
  slug: string;
  weekEnd: string;
  days: string[];
  roster: RosterRow[];
  payrollActivityRosterIds: string[];
  onWorkEventChanged: () => void;
};

const modes: Array<{
  id: AdjustmentMode;
  step: string;
  label: string;
  description: string;
}> = [
  {
    id: "work-evidence",
    step: "01",
    label: "Work evidence",
    description: "Missed days, helpers, training, and walk-ons",
  },
  {
    id: "pay-adjustment",
    step: "02",
    label: "Pay adjustment",
    description: "Bonuses, corrections, deductions, and targeted pay",
  },
];

export default function PayrollAdjustmentsWorkspace({
  slug,
  weekEnd,
  days,
  roster,
  payrollActivityRosterIds,
  onWorkEventChanged,
}: Props) {
  const [mode, setMode] = useState<AdjustmentMode>("work-evidence");

  return (
    <section className="payroll-adjustment-desk">
      <aside className="payroll-adjustment-desk__rail">
        <div>
          <p className="value-card__eyebrow">Adjustment desk</p>
          <h3>Choose the evidence</h3>
          <p>
            Start with what changed. Insight will expose only the fields needed
            to document it.
          </p>
        </div>

        <nav aria-label="Adjustment type" className="payroll-adjustment-desk__modes">
          {modes.map((item) => {
            const active = item.id === mode;

            return (
              <button
                key={item.id}
                type="button"
                className={`payroll-adjustment-mode${active ? " payroll-adjustment-mode--active" : ""}`}
                aria-pressed={active}
                onClick={() => setMode(item.id)}
              >
                <span className="payroll-adjustment-mode__step">{item.step}</span>
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.description}</small>
                </span>
              </button>
            );
          })}
        </nav>

        <div className="payroll-adjustment-desk__guidance">
          <span>Selected week</span>
          <strong>{days[0]} → {weekEnd}</strong>
          <p>
            Work evidence rebuilds payroll when saved. Pay adjustments remain
            staged until you choose Rebuild.
          </p>
        </div>
      </aside>

      <div
        className="payroll-adjustment-desk__surface"
        hidden={mode !== "work-evidence"}
      >
        <PayrollWorkEventsPanel
          slug={slug}
          days={days}
          roster={roster}
          onChanged={onWorkEventChanged}
        />
      </div>

      <div
        className="payroll-adjustment-desk__surface"
        hidden={mode !== "pay-adjustment"}
      >
        <PayrollAdjustmentsPanel
          slug={slug}
          weekEnd={weekEnd}
          roster={roster}
          payrollActivityRosterIds={payrollActivityRosterIds}
        />
      </div>
    </section>
  );
}
