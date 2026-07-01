"use client";

import PayrollTimeTrackingGrid from "@/features/payroll/components/PayrollTimeTrackingGrid";

type PayrollTimeTrackingWorkspaceProps = {
  slug: string;
  weekEnd: string;
  setWeekEnd: (value: string) => void;
};

export default function PayrollTimeTrackingWorkspace({
  slug,
  weekEnd,
  setWeekEnd,
}: PayrollTimeTrackingWorkspaceProps) {
  return (
    <PayrollTimeTrackingGrid
      slug={slug}
      weekEnd={weekEnd}
      setWeekEnd={setWeekEnd}
    />
  );
}
