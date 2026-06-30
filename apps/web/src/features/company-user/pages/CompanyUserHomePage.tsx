"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useAccess } from "@/features/access/AccessProvider";

type ScheduleRow = {
  roster_member_id: string;
  profile_id?: string | null;
  full_name?: string | null;
  default_route_s?: string | null;
  default_route_u?: string | null;
  default_route_m?: string | null;
  default_route_t?: string | null;
  default_route_w?: string | null;
  default_route_h?: string | null;
  default_route_f?: string | null;
  schedule_pending?: boolean | null;
};

type PreviewDay = {
  key: string;
  label: string;
  route: string;
};

const routeByDayKey: Record<number, keyof ScheduleRow> = {
  0: "default_route_s",
  1: "default_route_m",
  2: "default_route_t",
  3: "default_route_w",
  4: "default_route_h",
  5: "default_route_f",
  6: "default_route_u",
};

function firstNameFromDisplayName(displayName: string) {
  const first = displayName.trim().split(/\s+/)[0];
  return first || displayName;
}

function routeForDate(row: ScheduleRow | null, date: Date) {
  if (!row || row.schedule_pending) return null;
  const routeKey = routeByDayKey[date.getDay()];
  const rawRoute = row[routeKey];
  return typeof rawRoute === "string" && rawRoute.trim() ? rawRoute.trim() : null;
}

function buildSchedulePreview(row: ScheduleRow | null): PreviewDay[] {
  return Array.from({ length: 4 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index);

    const label =
      index === 0
        ? "Today"
        : index === 1
          ? "Tomorrow"
          : date.toLocaleDateString(undefined, { weekday: "long" });

    return {
      key: date.toISOString(),
      label,
      route: routeForDate(row, date) ?? "Off",
    };
  });
}

export default function CompanyUserHomePage() {
  const params = useParams();
  const slug = String(params?.slug ?? "");
  const access = useAccess();

  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadSchedule() {
      try {
        setLoading(true);
        setPageError(null);

        const res = await fetch(`/api/company/${slug}/schedule`, {
          credentials: "include",
          cache: "no-store",
        });

        const data = await res.json().catch(() => ({}));

        if (!active) return;

        if (!res.ok) {
          setRows([]);
          setPageError(data?.error ?? "Schedule is not available yet.");
          return;
        }

        setRows(Array.isArray(data?.rows) ? data.rows : []);
      } catch {
        if (!active) return;
        setRows([]);
        setPageError("Schedule is not available yet.");
      } finally {
        if (active) setLoading(false);
      }
    }

    if (slug) void loadSchedule();

    return () => {
      active = false;
    };
  }, [slug]);

  const myScheduleRow = useMemo(() => {
    if (!access.profile_id) return null;
    return rows.find((row) => row.profile_id === access.profile_id) ?? null;
  }, [access.profile_id, rows]);

  const displayName = access.display_name || access.first_name || access.email || "there";
  const firstName = firstNameFromDisplayName(displayName);
  const todayRoute = routeForDate(myScheduleRow, new Date());
  const schedulePreview = buildSchedulePreview(myScheduleRow);

  return (
    <main className="workspace-shell">
      <section className="workspace-main company-user-home">
        <section className="company-user-hero">
          <div>
            <h1 className="workspace-title">Hello, {firstName}.</h1>
            <p className="workspace-subtitle">Let&apos;s get started.</p>
          </div>
        </section>

        {pageError ? (
          <section className="app-card company-user-card">
            <p style={{ color: "#c62828", margin: 0 }}>{pageError}</p>
          </section>
        ) : null}

        <button
          type="button"
          className="app-card company-user-card company-user-workday-card"
          aria-label="Open today's workday"
        >
          <div>
            <p className="value-card__eyebrow">Today&apos;s Workday</p>
            <h2>{todayRoute ?? (loading ? "Loading route" : "No route scheduled")}</h2>
            <p>Start Time 8:00 AM</p>
          </div>

          <span className="company-user-workday-status">Clock In</span>
        </button>

        <section className="app-card company-user-card">
          <div className="company-user-section-header">
            <div>
              <p className="value-card__eyebrow">Schedule</p>
              <h2>Upcoming work</h2>
            </div>
            <Link href={`/company/${slug}/schedule`}>View Calendar</Link>
          </div>

          <div className="company-user-preview-list">
            {schedulePreview.map((day) => (
              <div key={day.key} className="company-user-preview-row">
                <span>{day.label}</span>
                <strong>{day.route}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="app-card company-user-card">
          <div className="company-user-section-header">
            <div>
              <p className="value-card__eyebrow">Company Updates</p>
              <h2>Nothing new right now</h2>
            </div>
          </div>
          <p className="company-user-muted">
            Broadcasts, reminders, incentives, and targeted company messages will appear here.
          </p>
        </section>

        <section className="app-card company-user-card">
          <div className="company-user-section-header">
            <div>
              <p className="value-card__eyebrow">Compliance</p>
              <h2>No urgent expirations</h2>
            </div>
          </div>
          <p className="company-user-muted">
            DOT, license, badge, and other upcoming expiration reminders will appear here.
          </p>
        </section>

        <section className="app-card company-user-card">
          <div className="company-user-section-header">
            <div>
              <p className="value-card__eyebrow">Driver Score</p>
              <h2>Scorecard coming soon</h2>
            </div>
          </div>
          <p className="company-user-muted">
            Performance score, rank, trends, attendance, and delivery history will live here.
          </p>
        </section>
      </section>
    </main>
  );
}
