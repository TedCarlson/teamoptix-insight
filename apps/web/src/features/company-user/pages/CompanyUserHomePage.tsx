"use client";

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


const routeByDayKey: Record<number, keyof ScheduleRow> = {
  0: "default_route_s",
  1: "default_route_m",
  2: "default_route_t",
  3: "default_route_w",
  4: "default_route_h",
  5: "default_route_f",
  6: "default_route_u",
};

function todayLongLabel() {
  return new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function getTodayRoute(row: ScheduleRow | null) {
  if (!row || row.schedule_pending) return null;
  const routeKey = routeByDayKey[new Date().getDay()];
  const rawRoute = row[routeKey];
  return typeof rawRoute === "string" && rawRoute.trim() ? rawRoute.trim() : null;
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

  const todayRoute = getTodayRoute(myScheduleRow);

  const displayName =
    access.display_name ||
    access.first_name ||
    access.email ||
    "there";

  return (
    <main className="workspace-shell">
      <section className="workspace-main company-user-home">
        <section className="company-user-hero">
          <div>
            <p className="value-card__eyebrow">{todayLongLabel()}</p>
            <h1 className="workspace-title">{greeting()}, {displayName}</h1>
          </div>
        </section>

        {pageError ? (
          <section className="app-card company-user-card">
            <p style={{ color: "#c62828", margin: 0 }}>{pageError}</p>
          </section>
        ) : null}

        <section className="app-card company-user-card company-user-today">
          <p className="value-card__eyebrow">Today</p>

          <div className="company-user-action">
            <div>
              <span>Start time</span>
              <strong>8:00 AM</strong>
            </div>

            <button type="button" className="button button-primary">
              Clock in
            </button>
          </div>

          <div className="company-user-today-grid">
            <div>
              <span>Route</span>
              <strong>{loading ? "Loading..." : todayRoute ?? "Not assigned"}</strong>
            </div>
            <div>
              <span>Planned volume</span>
              <strong>Pending</strong>
            </div>
          </div>
        </section>

        <section className="app-card company-user-card">
          <div className="company-user-card-head">
            <div>
              <p className="value-card__eyebrow">My schedule</p>
              <h2 className="app-card__title">
                {loading ? "Loading..." : todayRoute ? "You are scheduled today" : "No shift scheduled today"}
              </h2>
              <p className="app-card__body" style={{ marginTop: 4 }}>
                {todayRoute ? `Route ${todayRoute}` : "Open your schedule to review upcoming shifts."}
              </p>
            </div>

            <a className="button" href={`/company/${slug}/schedule`}>
              View schedule
            </a>
          </div>
        </section>

        <section className="app-card company-user-card">
          <p className="value-card__eyebrow">Updates</p>
          <h2 className="app-card__title">No announcements</h2>
          <p className="app-card__body">Company messages and dispatch reminders will show here.</p>
        </section>

        <section className="app-card company-user-card">
          <p className="value-card__eyebrow">My profile</p>
          <h2 className="app-card__title">Access active</h2>
          <p className="app-card__body">Your company access is ready.</p>
        </section>
      </section>
    </main>
  );
}
