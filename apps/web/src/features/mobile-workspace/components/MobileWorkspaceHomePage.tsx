"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  CalendarDays,
  ClipboardList,
  DollarSign,
  Route,
  Settings,
  Truck,
  Users,
} from "lucide-react";
import { useAccess } from "@/features/access/AccessProvider";
import { DriverMobileShell } from "@/features/driver/shell/DriverMobileShell";
import {
  buildMobileWorkspaceGroups,
  type MobileWorkspaceIcon,
} from "@/features/mobile-workspace/mobileWorkspace";

const icons = {
  calendar: CalendarDays,
  clipboard: ClipboardList,
  dollar: DollarSign,
  route: Route,
  settings: Settings,
  truck: Truck,
  users: Users,
} satisfies Record<MobileWorkspaceIcon, typeof CalendarDays>;

export default function MobileWorkspaceHomePage() {
  const params = useParams();
  const slug = String(params?.slug ?? "");
  const access = useAccess();
  const membership = access.memberships.find((item) => item.company_slug === slug) ?? null;
  const groups = buildMobileWorkspaceGroups(access, slug);
  const destinationCount = groups.reduce(
    (count, group) => count + group.destinations.length,
    0
  );

  return (
    <DriverMobileShell slug={slug}>
      <section className="mobile-workspace-page">
        <header className="mobile-workspace-hero">
          <p className="mobile-workspace-eyebrow">Continuity workspace</p>
          <h1>Your tools, matched to your access</h1>
          <p>
            Use this web fallback when the mobile app is unavailable. The tools below
            are limited to your active company grants.
          </p>
          <div className="mobile-workspace-access-summary">
            <span>{membership?.title || "Company workspace"}</span>
            <strong>
              {access.loading
                ? "Checking access…"
                : `${destinationCount} workspace${destinationCount === 1 ? "" : "s"}`}
            </strong>
          </div>
        </header>

        {!access.loading && groups.length === 0 ? (
          <section className="mobile-workspace-empty">
            <strong>No management workspaces are assigned.</strong>
            <p>Your personal schedule and driver tools remain available in the navigation below.</p>
          </section>
        ) : null}

        {groups.map((group) => (
          <section className="mobile-workspace-group" key={group.key}>
            <div className="mobile-workspace-group__heading">
              <h2>{group.label}</h2>
              <span>{group.destinations.length}</span>
            </div>

            <div className="mobile-workspace-grid">
              {group.destinations.map((destination) => {
                const Icon = icons[destination.icon];

                return (
                  <Link
                    className="mobile-workspace-card"
                    href={destination.href}
                    key={destination.key}
                  >
                    <span className="mobile-workspace-card__icon">
                      <Icon aria-hidden="true" size={20} />
                    </span>
                    <span className="mobile-workspace-card__copy">
                      <strong>{destination.label}</strong>
                      <small>{destination.description}</small>
                    </span>
                    <span
                      className={`mobile-workspace-readiness mobile-workspace-readiness--${destination.readiness}`}
                    >
                      {destination.readiness === "mobile_bridge"
                        ? "Mobile bridge"
                        : "Web workspace"}
                    </span>
                    <span className="mobile-workspace-card__arrow" aria-hidden="true">›</span>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}

        <footer className="mobile-workspace-note">
          <strong>Fallback scope</strong>
          <p>
            This continuity layer keeps critical access reachable. Full desktop workflows
            may still be easier to complete on a larger screen.
          </p>
        </footer>
      </section>
    </DriverMobileShell>
  );
}
