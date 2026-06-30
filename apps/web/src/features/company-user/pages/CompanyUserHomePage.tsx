"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useAccess } from "@/features/access/AccessProvider";
import {
  IntentVerificationDrawer,
  type IntentVerificationAction,
} from "@/features/security/components/IntentVerificationDrawer";

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
  preset_works_s?: boolean | null;
  preset_works_u?: boolean | null;
  preset_works_m?: boolean | null;
  preset_works_t?: boolean | null;
  preset_works_w?: boolean | null;
  preset_works_h?: boolean | null;
  preset_works_f?: boolean | null;
  rotation_works_s?: boolean | null;
  rotation_works_u?: boolean | null;
  rotation_works_m?: boolean | null;
  rotation_works_t?: boolean | null;
  rotation_works_w?: boolean | null;
  rotation_works_h?: boolean | null;
  rotation_works_f?: boolean | null;
  schedule_pending?: boolean | null;
};

type PreviewDay = {
  key: string;
  label: string;
  route: string;
};

type ActivityCurrentResponse = {
  ok?: boolean;
  state?: "CLOCKED_IN" | "CLOCKED_OUT" | string;
  lastClockIn?: { occurred_at: string } | null;
  lastClockOut?: { occurred_at: string } | null;
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

const presetWorksByDayKey: Record<number, keyof ScheduleRow> = {
  0: "preset_works_s",
  1: "preset_works_m",
  2: "preset_works_t",
  3: "preset_works_w",
  4: "preset_works_h",
  5: "preset_works_f",
  6: "preset_works_u",
};

const rotationWorksByDayKey: Record<number, keyof ScheduleRow> = {
  0: "rotation_works_s",
  1: "rotation_works_m",
  2: "rotation_works_t",
  3: "rotation_works_w",
  4: "rotation_works_h",
  5: "rotation_works_f",
  6: "rotation_works_u",
};

function isScheduledForDate(row: ScheduleRow | null, date: Date) {
  if (!row || row.schedule_pending) return false;

  const presetKey = presetWorksByDayKey[date.getDay()];
  const rotationKey = rotationWorksByDayKey[date.getDay()];

  return row[rotationKey] === true || row[presetKey] === true;
}

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

    const scheduled = isScheduledForDate(row, date);
    const route = routeForDate(row, date);

    return {
      key: date.toISOString(),
      label,
      route: scheduled ? route ?? "Awaiting Assignment" : "Off",
    };
  });
}

function formatTime(value?: string | null) {
  if (!value) return null;

  return new Date(value).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function CompanyUserHomePage() {
  const params = useParams();
  const slug = String(params?.slug ?? "");
  const access = useAccess();

  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activityLoading, setActivityLoading] = useState(true);
  const [activitySaving, setActivitySaving] = useState(false);
  const [activityState, setActivityState] = useState<ActivityCurrentResponse | null>(null);
  const [clockConfirm, setClockConfirm] = useState<IntentVerificationAction | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  const loadActivity = useCallback(async () => {
    if (!slug) return;

    try {
      setActivityLoading(true);

      const res = await fetch(`/api/company/${slug}/driver/activity/current`, {
        credentials: "include",
        cache: "no-store",
      });

      const data = (await res.json().catch(() => ({}))) as ActivityCurrentResponse;

      if (!res.ok) {
        setActivityState(null);
        return;
      }

      setActivityState(data);
    } finally {
      setActivityLoading(false);
    }
  }, [slug]);

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

    if (slug) {
      void loadSchedule();
      void loadActivity();
    }

    return () => {
      active = false;
    };
  }, [loadActivity, slug]);

  const myScheduleRow = useMemo(() => {
    if (!access.profile_id) return null;
    return rows.find((row) => row.profile_id === access.profile_id) ?? null;
  }, [access.profile_id, rows]);

  const displayName = access.display_name || access.first_name || access.email || "there";
  const firstName = firstNameFromDisplayName(displayName);
  const todayRoute = routeForDate(myScheduleRow, new Date());
  const schedulePreview = buildSchedulePreview(myScheduleRow);
  const isClockedIn = activityState?.state === "CLOCKED_IN";
  const lastClockInTime = formatTime(activityState?.lastClockIn?.occurred_at);

  const workdayTitle = activityLoading
    ? "Checking workday"
    : isClockedIn
      ? "You're Working"
      : "Ready to Start";

  const workdaySubtitle = (() => {
    if (isClockedIn) {
      return lastClockInTime
        ? `Started at ${lastClockInTime}`
        : "Workday in progress";
    }

    if (loading) {
      return "Loading workday...";
    }

    const scheduledToday = isScheduledForDate(myScheduleRow, new Date());

    if (!scheduledToday) {
      return "Today is your scheduled day off.";
    }

    if (todayRoute) {
      return `Route ${todayRoute}`;
    }

    return "Report to Leadership for assignment.";
  })();

  const workdayAction = isClockedIn ? "Clock Out" : "Clock In";

  function handleWorkdayAction() {
    if (!slug || activitySaving || activityLoading) return;

    const eventType: IntentVerificationAction = isClockedIn ? "CLOCK_OUT" : "CLOCK_IN";
    setClockConfirm(eventType);
  }

  async function commitWorkdayAction() {
    if (!clockConfirm) return;
    if (!slug || activitySaving || activityLoading) return;

    const eventType = clockConfirm;

    try {
      setActivitySaving(true);

      const res = await fetch(`/api/company/${slug}/driver/activity`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          event_type: eventType,
          roster_member_id: myScheduleRow?.roster_member_id ?? null,
          device_occurred_at: new Date().toISOString(),
          event_payload: {
            route: todayRoute,
            source_surface: "driver_home",
          },
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setPageError(data?.error ?? "Could not record workday activity.");
        return;
      }

      setPageError(null);
      setClockConfirm(null);
      await loadActivity();
    } catch {
      setPageError("Could not record workday activity.");
    } finally {
      setActivitySaving(false);
    }
  }
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
          className={`app-card company-user-card company-user-workday-card ${
            isClockedIn ? "company-user-workday-card--active" : ""
          }`}
          onClick={handleWorkdayAction}
          disabled={activitySaving || activityLoading}
          aria-label={workdayAction}
        >
          <div>
            <p className="value-card__eyebrow">Today&apos;s Workday</p>
            <h2>{workdayTitle}</h2>
            <p>{workdaySubtitle}</p>
          </div>

          <span className="company-user-workday-status">
            {activitySaving ? "Saving..." : workdayAction}
          </span>
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
        {clockConfirm ? (
          <IntentVerificationDrawer
            action={clockConfirm}
            busy={activitySaving}
            onCancel={() => setClockConfirm(null)}
            onConfirm={() => void commitWorkdayAction()}
          />
        ) : null}
      </section>
    </main>
  );
}
