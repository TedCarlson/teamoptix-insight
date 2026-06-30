"use client";

import { useParams } from "next/navigation";
import { DriverScheduleCalendar } from "@/features/company-user/components/DriverScheduleCalendar";

export default function DriverSchedulePage() {
  const params = useParams();
  const slug = String(params?.slug ?? "");

  return (
    <main className="workspace-shell">
      <section className="workspace-main company-user-home">
        <DriverScheduleCalendar slug={slug} />
      </section>
    </main>
  );
}
