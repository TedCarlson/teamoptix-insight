"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useAccess } from "@/features/access/AccessProvider";

type ScheduleRow = {
  roster_member_id: string;
  profile_id?: string | null;
  full_name?: string | null;
  worker_type?: string | null;
  employment_status?: string | null;
  market_code?: string | null;
  default_route_s?: string | null;
  default_route_u?: string | null;
  default_route_m?: string | null;
  default_route_t?: string | null;
  default_route_w?: string | null;
  default_route_h?: string | null;
  default_route_f?: string | null;
  schedule_pending?: boolean | null;
};

type ForecastDay = {
  iso: string;
  label: string;
  route: string | null;
  status: "scheduled" | "off" | "pending";
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

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dayLabel(date: Date) {
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function buildForecast(row: ScheduleRow | null): ForecastDay[] {
  const today = new Date();

  return Array.from({ length: 14 }).map((_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() + index);

    if (!row || row.schedule_pending) {
      return {
        iso: isoDate(date),
        label: dayLabel(date),
        route: null,
        status: "pending",
      };
    }

    const routeKey = routeByDayKey[date.getDay()];
    const rawRoute = row[routeKey];
    const route = typeof rawRoute === "string" && rawRoute.trim() ? rawRoute.trim() : null;

    return {
      iso: isoDate(date),
      label: dayLabel(date),
      route,
      status: route ? "scheduled" : "off",
    };
  });
}

function StatusPill(props: { status: ForecastDay["status"] }) {
  const label =
    props.status === "scheduled"
      ? "Scheduled"
      : props.status === "off"
        ? "Off"
        : "Pending";

  return <span className="app-nav-pill" style={{ fontSize: 12 }}>{label}</span>;
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
          setPageError(data?.error ?? "Schedule forecast is not available yet.");
          return;
        }

        setRows(Array.isArray(data?.rows) ? data.rows : []);
      } catch {
        if (!active) return;
        setRows([]);
        setPageError("Schedule forecast is not available yet.");
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

  const forecast = useMemo(() => buildForecast(myScheduleRow), [myScheduleRow]);

  const displayName =
    access.display_name ||
    [access.first_name, access.last_name].filter(Boolean).join(" ") ||
    access.email ||
    "Company user";

  return (
    <main className="workspace-shell">
      <section className="workspace-main" style={{ paddingTop: 0, paddingBottom: 24 }}>
        <section className="app-card" style={{ padding: 16, marginBottom: 10 }}>
          <p className="value-card__eyebrow">Company home</p>
          <h1 className="workspace-title">Welcome, {displayName}</h1>
          <p className="app-card__body" style={{ marginTop: 6 }}>
            This is your company landing page. Announcements, schedule visibility, and basic profile items will live here.
          </p>
        </section>

        {pageError ? (
          <section className="app-card" style={{ padding: 14, marginBottom: 10 }}>
            <p style={{ color: "#c62828", margin: 0 }}>{pageError}</p>
          </section>
        ) : null}

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.35fr) minmax(320px, .65fr)",
            gap: 10,
            alignItems: "start",
          }}
        >
          <section className="app-card" style={{ padding: 14 }}>
            <p className="value-card__eyebrow">My schedule</p>
            <h2 className="app-card__title">14-day forecast</h2>
            <p className="app-card__body" style={{ marginTop: 4 }}>
              Drawn from the current baseline schedule. Time-off requests will land here later.
            </p>

            <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
              {loading ? (
                <p className="app-card__body">Loading schedule forecast...</p>
              ) : (
                forecast.map((day) => (
                  <div
                    key={day.iso}
                    className="context-stat"
                    style={{
                      display: "grid",
                      gridTemplateColumns: "120px minmax(0, 1fr) auto",
                      gap: 10,
                      alignItems: "center",
                    }}
                  >
                    <strong>{day.label}</strong>
                    <span>{day.route ?? (day.status === "pending" ? "Schedule pending" : "Not scheduled")}</span>
                    <StatusPill status={day.status} />
                  </div>
                ))
              )}
            </div>
          </section>

          <aside style={{ display: "grid", gap: 10 }}>
            <section className="app-card" style={{ padding: 14 }}>
              <p className="value-card__eyebrow">Announcements</p>
              <h2 className="app-card__title">Message board</h2>
              <p className="app-card__body" style={{ marginTop: 4 }}>
                Company-wide announcements and operational reminders will surface here.
              </p>
              <div className="cta-row" style={{ marginTop: 12 }}>
                <a className="button" href={`/company/${slug}/announcements`}>
                  View announcements
                </a>
              </div>
            </section>

            <section className="app-card" style={{ padding: 14 }}>
              <p className="value-card__eyebrow">My profile</p>
              <h2 className="app-card__title">Access posture</h2>
              <p className="app-card__body" style={{ marginTop: 4 }}>
                Profile, company membership, and app access status will continue to mature here.
              </p>
            </section>
          </aside>
        </section>
      </section>
    </main>
  );
}
