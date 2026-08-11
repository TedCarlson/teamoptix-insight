"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  CalendarDays,
  CalendarRange,
  ClipboardPenLine,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";
import { useAccess } from "@/features/access/AccessProvider";
import { canAccessCompanyWorkspace } from "@/features/company/config/companyWorkspaceAccess";
import { DriverMobileShell } from "@/features/driver/shell/DriverMobileShell";

const managementSurfaces = [
  {
    key: "calendar",
    label: "Calendar",
    description: "Review workforce coverage and daily route demand.",
    path: "",
    Icon: CalendarDays,
  },
  {
    key: "workbench",
    label: "Workbench",
    description: "Build and commit the generated schedule.",
    path: "/generated",
    Icon: CalendarRange,
  },
  {
    key: "overrides",
    label: "Overrides",
    description: "Handle time off, call-outs, add-ins, and route changes.",
    path: "/overrides",
    Icon: ClipboardPenLine,
  },
  {
    key: "presets",
    label: "Presets",
    description: "Maintain reusable work-pattern presets.",
    path: "/presets",
    Icon: SlidersHorizontal,
  },
];

export default function MobileScheduleBridgePage() {
  const params = useParams();
  const slug = String(params?.slug ?? "");
  const access = useAccess();
  const canManageSchedule = canAccessCompanyWorkspace(access, slug, "schedule");
  const scheduleBase = `/company/${slug}/schedule`;

  return (
    <DriverMobileShell slug={slug}>
      <section className="mobile-workspace-page mobile-schedule-bridge">
        <header className="mobile-workspace-hero">
          <Link className="mobile-workspace-back" href={`/company/${slug}/mobile`}>
            ‹ All workspaces
          </Link>
          <p className="mobile-workspace-eyebrow">Schedule</p>
          <h1>Personal and management views</h1>
          <p>
            Start with your own calendar, or continue into the company Schedule workspace
            when you need to manage coverage.
          </p>
        </header>

        <section className="mobile-workspace-group">
          <div className="mobile-workspace-group__heading">
            <h2>Personal</h2>
          </div>
          <Link className="mobile-workspace-card" href={`/company/${slug}/driver/schedule`}>
            <span className="mobile-workspace-card__icon">
              <UserRound aria-hidden="true" size={20} />
            </span>
            <span className="mobile-workspace-card__copy">
              <strong>My Schedule</strong>
              <small>View your assignments and submit time-off requests.</small>
            </span>
            <span className="mobile-workspace-readiness mobile-workspace-readiness--mobile_bridge">
              Mobile ready
            </span>
            <span className="mobile-workspace-card__arrow" aria-hidden="true">›</span>
          </Link>
        </section>

        {access.loading ? (
          <p className="mobile-workspace-loading">Checking Schedule access…</p>
        ) : canManageSchedule ? (
          <section className="mobile-workspace-group">
            <div className="mobile-workspace-group__heading">
              <h2>Manage schedule</h2>
              <span>{managementSurfaces.length}</span>
            </div>
            <div className="mobile-workspace-grid">
              {managementSurfaces.map(({ key, label, description, path, Icon }) => (
                <Link className="mobile-workspace-card" href={`${scheduleBase}${path}`} key={key}>
                  <span className="mobile-workspace-card__icon">
                    <Icon aria-hidden="true" size={20} />
                  </span>
                  <span className="mobile-workspace-card__copy">
                    <strong>{label}</strong>
                    <small>{description}</small>
                  </span>
                  <span className="mobile-workspace-readiness mobile-workspace-readiness--web_workspace">
                    Web workspace
                  </span>
                  <span className="mobile-workspace-card__arrow" aria-hidden="true">›</span>
                </Link>
              ))}
            </div>
          </section>
        ) : (
          <section className="mobile-workspace-empty">
            <strong>Management tools are not in your scope.</strong>
            <p>Ask a company administrator if your role requires Schedule workspace access.</p>
          </section>
        )}
      </section>
    </DriverMobileShell>
  );
}
