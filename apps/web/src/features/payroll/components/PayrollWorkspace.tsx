"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import PayrollGrid, { type PayrollView } from "@/features/payroll/components/PayrollGrid";
import PayrollProductivityWorkspace from "@/features/payroll/components/PayrollProductivityWorkspace";
import PayrollTimeTrackingWorkspace from "@/features/payroll/components/PayrollTimeTrackingWorkspace";
import { defaultPayrollWeekEndFriday } from "@/features/payroll/lib/payroll.date";

type PayrollWorkspaceProps = {
  slug: string;
};

function payrollViewFromPath(pathname: string): PayrollView {
  if (pathname.includes("/payroll/adjustments")) return "adjustments";
  if (pathname.includes("/payroll/productivity/row-detail")) return "row-detail";
  if (pathname.includes("/payroll/productivity")) return "payroll-detail";
  return "summary";
}

export default function PayrollWorkspace({ slug }: PayrollWorkspaceProps) {
  const pathname = usePathname() ?? "";
  const [weekEnd, setWeekEnd] = useState(defaultPayrollWeekEndFriday);
  const isTimeTracking = pathname.includes("/payroll/time-tracking");
  const isProductivity = pathname.includes("/payroll/productivity");

  return (
    <section className="payroll-workspace">
      {isTimeTracking ? (
        <PayrollTimeTrackingWorkspace slug={slug} weekEnd={weekEnd} setWeekEnd={setWeekEnd} />
      ) : isProductivity ? (
        <PayrollProductivityWorkspace />
      ) : (
        <PayrollGrid view={payrollViewFromPath(pathname)} />
      )}
    </section>
  );
}
