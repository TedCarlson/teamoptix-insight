"use client";

import { useParams } from "next/navigation";
import { DriverScheduleCalendar } from "@/features/company-user/components/DriverScheduleCalendar";
import { DriverMobileShell } from "@/features/driver/shell/DriverMobileShell";

export default function DriverSchedulePage() {
  const params = useParams();
  const slug = String(params?.slug ?? "");

  return (
    <DriverMobileShell slug={slug}>
      <section className="company-user-home">
        <DriverScheduleCalendar slug={slug} />
      </section>
    </DriverMobileShell>
  );
}
