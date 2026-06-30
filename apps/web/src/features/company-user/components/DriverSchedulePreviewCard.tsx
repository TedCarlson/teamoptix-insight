"use client";

import Link from "next/link";

export type DriverSchedulePreviewDay = {
  key: string;
  label: string;
  route: string;
};

type DriverSchedulePreviewCardProps = {
  slug: string;
  days: DriverSchedulePreviewDay[];
};

export function DriverSchedulePreviewCard({
  slug,
  days,
}: DriverSchedulePreviewCardProps) {
  return (
    <section className="app-card company-user-card">
      <div className="company-user-section-header">
        <div>
          <p className="value-card__eyebrow">Schedule</p>
          <h2>Week at a glance</h2>
        </div>
        <Link href={`/company/${slug}/schedule`}>View Calendar</Link>
      </div>

      <div className="driver-schedule-week-row">
        {days.map((day) => (
          <div key={day.key} className="driver-schedule-day-chip">
            <span>{day.label}</span>
            <strong>{day.route}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
