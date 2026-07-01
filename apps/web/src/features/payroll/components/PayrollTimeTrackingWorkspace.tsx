"use client";

import { usePathname } from "next/navigation";
import { PayrollTimeKeepingPage } from "@/features/payroll/components/PayrollTimeKeepingPage";
import { addDays, weekRangeLabel } from "@/features/payroll/lib/payroll.date";

type PayrollTimeTrackingWorkspaceProps = {
  slug: string;
  weekEnd: string;
  setWeekEnd: (value: string) => void;
};

function PlaceholderCard({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <article className="value-card">
      <p className="value-card__eyebrow">{eyebrow}</p>
      <h3 className="value-card__title">{title}</h3>
      <p style={{ margin: 0, color: "#64748b" }}>{body}</p>
    </article>
  );
}

export default function PayrollTimeTrackingWorkspace({
  slug,
  weekEnd,
  setWeekEnd,
}: PayrollTimeTrackingWorkspaceProps) {
  const pathname = usePathname() ?? "";
  const isDutyHours = pathname.includes("/time-tracking/duty-hours");
  const isDotHours = pathname.includes("/time-tracking/dot-hours");

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div className="payroll-workspace-toolbar">
        <div>
          <p className="value-card__eyebrow">Time Tracking</p>
          <h2 className="app-card__title">Contractor time evidence</h2>
        </div>

        <div className="payroll-workspace-toolbar__actions">
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
        </div>
      </div>

      {isDutyHours ? (
        <PlaceholderCard
          eyebrow="Duty Hours"
          title="FedEx duty-hour reconciliation"
          body="This surface will compare contractor time evidence against FedEx duty-hour records."
        />
      ) : isDotHours ? (
        <PlaceholderCard
          eyebrow="DOT Hours"
          title="DOT-hour audit surface"
          body="This surface will support driver hour review, compliance visibility, and exception investigation."
        />
      ) : (
        <PayrollTimeKeepingPage slug={slug} weekEnd={weekEnd} />
      )}
    </section>
  );
}
