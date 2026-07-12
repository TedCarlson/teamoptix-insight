"use client";

import { useParams } from "next/navigation";
import { DriverMobileShell } from "@/features/driver/shell/DriverMobileShell";

export default function DriverScorecardPage() {
  const params = useParams();
  const slug = String(params?.slug ?? "");

  return (
    <DriverMobileShell slug={slug}>
      <section className="company-user-home">
        <section className="app-card company-user-card">
          <div className="company-user-section-header">
            <div>
              <p className="value-card__eyebrow">Scorecard</p>
              <h1>Driver KPIs</h1>
            </div>
          </div>
          <p className="company-user-muted">
            Performance score, attendance trends, service quality, route history, and delivery KPIs will appear here.
          </p>
        </section>

        <section className="app-card company-user-card">
          <div className="company-user-section-header">
            <div>
              <p className="value-card__eyebrow">Coming soon</p>
              <h2>KPI workspace pending</h2>
            </div>
          </div>
          <p className="company-user-muted">
            This tab is reserved for the driver-facing scorecard and operational performance review surface.
          </p>
        </section>
      </section>
    </DriverMobileShell>
  );
}
