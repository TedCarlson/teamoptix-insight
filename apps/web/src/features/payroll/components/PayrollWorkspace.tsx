"use client";

import { useCallback, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import PayrollGrid, {
  type PayrollView,
} from "@/features/payroll/components/PayrollGrid";
import PayrollTimeTrackingWorkspace from "@/features/payroll/components/PayrollTimeTrackingWorkspace";
import PayrollComplianceWorkspace from "@/features/payroll/components/PayrollComplianceWorkspace";
import { defaultPayrollWeekEndFriday } from "@/features/payroll/lib/payroll.date";

type PayrollWorkspaceProps = {
  slug: string;
};

function isIsoDate(value: string | null | undefined): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function payrollViewFromPath(pathname: string): PayrollView {
  if (pathname.includes("/payroll/adjustments")) return "adjustments";
  if (pathname.includes("/payroll/productivity/row-detail")) return "row-detail";
  if (pathname.includes("/payroll/productivity")) return "payroll-detail";
  return "summary";
}

export default function PayrollWorkspace({ slug }: PayrollWorkspaceProps) {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const requestedWeekEnd = searchParams.get("weekEnd");
  const [weekEnd, setWeekEnd] = useState(() =>
    isIsoDate(requestedWeekEnd)
      ? requestedWeekEnd
      : defaultPayrollWeekEndFriday()
  );
  const isTimeTracking = pathname.includes("/payroll/time-tracking");
  const isCompliance = pathname.includes("/payroll/compliance");
  const isProductivity = pathname.includes("/payroll/productivity");
  const [productivityView, setProductivityView] = useState<
    Extract<PayrollView, "payroll-detail" | "row-detail">
  >("payroll-detail");

  const updateWeekEnd = useCallback(
    (nextWeekEnd: string) => {
      if (!isIsoDate(nextWeekEnd)) return;

      setWeekEnd(nextWeekEnd);

      const params = new URLSearchParams(window.location.search);
      params.set("weekEnd", nextWeekEnd);
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}?${params.toString()}`
      );
    },
    []
  );

  const gridView = isProductivity
    ? productivityView
    : payrollViewFromPath(pathname);

  return (
    <section>
      <div hidden={isTimeTracking || isCompliance}>
        <PayrollGrid
          slug={slug}
          weekEnd={weekEnd}
          setWeekEnd={updateWeekEnd}
          view={gridView}
          viewPicker={
            isProductivity ? (
              <div className="workspace-view-picker">
                <span>View</span>
                <select
                  className="workspace-select"
                  value={productivityView}
                  onChange={(event) =>
                    setProductivityView(
                      event.target.value as typeof productivityView
                    )
                  }
                >
                  <option value="payroll-detail">Payroll Detail</option>
                  <option value="row-detail">Row Detail</option>
                </select>
              </div>
            ) : undefined
          }
        />
      </div>

      {isCompliance ? <PayrollComplianceWorkspace slug={slug} /> : null}

      <div hidden={!isTimeTracking}>
        <PayrollTimeTrackingWorkspace
          slug={slug}
          weekEnd={weekEnd}
          setWeekEnd={updateWeekEnd}
        />
      </div>
    </section>
  );
}
