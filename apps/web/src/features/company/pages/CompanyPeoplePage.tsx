"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  Clock3,
  Umbrella,
  UserRoundCheck,
  UserRoundX,
  Users,
} from "lucide-react";
import type { WorkforceResignationNotice } from "@/features/company/analytics/workforce/resignationNotice";
import styles from "./people-landing.module.css";

type RosterMetricRow = {
  roster_member_id?: string | null;
  full_name?: string | null;
  worker_type?: string | null;
  employment_status?: "Active" | "Trainee" | "Candidate" | "Former" | null;
  hire_date?: string | null;
  separation_date?: string | null;
};

type ScheduleDayRow = {
  roster_member_id: string;
  full_name?: string | null;
  service_date: string;
  planned_on: boolean;
  route_name?: string | null;
  override_type?: string | null;
};

type InterviewRow = {
  id: string;
  starts_at?: string | null;
  ends_at?: string | null;
  interview_status: string;
  first_name?: string | null;
  last_name?: string | null;
  manual_name?: string | null;
  phone?: string | null;
  email?: string | null;
  meeting_provider?: string | null;
};

type TimeOffRequestRow = {
  id: string;
  requested_dates?: string[] | null;
  status: string;
};

type DailyMetricProps = {
  icon: React.ReactNode;
  label: string;
  value: number;
  detail: string;
  tone?: "default" | "warning" | "positive";
};

type RetentionWindow = {
  days: 30 | 60 | 90;
  activations: number;
  departures: number;
  score: number | null;
  factor: string;
  posture: "quiet" | "growth" | "balanced" | "pressure";
};

function localIsoDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateTimeIsoDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : localIsoDate(date);
}

function timeLabel(value?: string | null) {
  if (!value) return "Time pending";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time pending";
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function shortDateLabel(value?: string | null) {
  if (!value) return "Date pending";
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "Date pending";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date);
}

function interviewName(interview: InterviewRow) {
  return (
    interview.manual_name?.trim() ||
    [interview.first_name, interview.last_name].filter(Boolean).join(" ").trim() ||
    "Interviewee"
  );
}

function interviewBurden(interviews: InterviewRow[]) {
  const minutes = interviews.reduce((total, interview) => {
    if (!interview.starts_at || !interview.ends_at) return total;
    const start = new Date(interview.starts_at).getTime();
    const end = new Date(interview.ends_at).getTime();
    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return total;
    return total + Math.round((end - start) / 60_000);
  }, 0);

  if (minutes === 0) return interviews.length ? "Times need review" : "No calls scheduled";
  if (minutes < 60) return `${minutes} scheduled minutes`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours} hr${hours === 1 ? "" : "s"}${remainder ? ` ${remainder} min` : ""} scheduled`;
}

function uniqueScheduleRows(rows: ScheduleDayRow[]) {
  return Array.from(
    new Map(rows.map((row) => [row.roster_member_id, row])).values()
  );
}

function isDriverRole(value?: string | null) {
  const role = value?.trim().toLowerCase();
  return role === "driver" || role === "lead driver";
}

function isLeadershipRole(value?: string | null) {
  const role = value?.trim().toLowerCase();
  return role === "business contact" ||
    role === "assistant bc" ||
    role === "fleet manager";
}

function rollingCutoff(today: string, days: number) {
  const cutoff = new Date(`${today}T00:00:00`);
  cutoff.setDate(cutoff.getDate() - (days - 1));
  return localIsoDate(cutoff);
}

function inRollingWindow(value: string | null | undefined, today: string, days: number) {
  if (!value) return false;
  const date = value.slice(0, 10);
  return date >= rollingCutoff(today, days) && date <= today;
}

function retentionWindow(
  rows: RosterMetricRow[],
  today: string,
  days: 30 | 60 | 90
): RetentionWindow {
  const drivers = rows.filter((row) => isDriverRole(row.worker_type));
  const activations = drivers.filter((row) =>
    inRollingWindow(row.hire_date, today, days)
  ).length;
  const departures = drivers.filter((row) =>
    inRollingWindow(row.separation_date, today, days)
  ).length;
  const movement = activations + departures;
  const score = movement === 0 ? null : Math.round((activations / movement) * 100);
  const factor = movement === 0
    ? "No movement"
    : departures === 0
      ? "No exits"
      : `${(activations / departures).toFixed(1)}× replacement`;
  const posture = score == null
    ? "quiet"
    : score >= 67
      ? "growth"
      : score >= 45
        ? "balanced"
        : "pressure";

  return { days, activations, departures, score, factor, posture };
}

function retentionPostureLabel(posture: RetentionWindow["posture"]) {
  if (posture === "growth") return "Growth posture";
  if (posture === "balanced") return "Replacement balanced";
  if (posture === "pressure") return "Churn pressure";
  return "Quiet window";
}

async function fetchJson(url: string) {
  const response = await fetch(url, {
    credentials: "include",
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || "This People signal is unavailable.");
  return body;
}

function DailyMetric(props: DailyMetricProps) {
  return (
    <div
      className={`${styles.dailyMetric} ${styles[`dailyMetric_${props.tone ?? "default"}`]}`}
    >
      <span className={styles.dailyMetricIcon}>{props.icon}</span>
      <span className={styles.dailyMetricCopy}>
        <small>{props.label}</small>
        <strong>{props.value}</strong>
        <span>{props.detail}</span>
      </span>
    </div>
  );
}

export default function CompanyPeoplePage() {
  const slug = String(useParams()?.slug ?? "");
  const today = useMemo(() => localIsoDate(new Date()), []);
  const [roster, setRoster] = useState<RosterMetricRow[]>([]);
  const [scheduleRows, setScheduleRows] = useState<ScheduleDayRow[]>([]);
  const [interviews, setInterviews] = useState<InterviewRow[]>([]);
  const [pendingRequests, setPendingRequests] = useState<TimeOffRequestRow[]>([]);
  const [noticeResignations, setNoticeResignations] = useState<WorkforceResignationNotice[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailableSignals, setUnavailableSignals] = useState(0);

  const load = useCallback(async () => {
    if (!slug) return;
    await Promise.resolve();
    setLoading(true);

    const results = await Promise.allSettled([
      fetchJson(`/api/company/${slug}/people/roster`),
      fetchJson(`/api/company/${slug}/schedule/generated?date=${today}`),
      fetchJson(`/api/company/${slug}/people/interviews`),
      fetchJson(`/api/company/${slug}/schedule/time-off-requests`),
      fetchJson(`/api/company/${slug}/people/reports/workforce-readiness?as_of=${today}`),
    ]);

    const [rosterResult, scheduleResult, interviewResult, timeOffResult, readinessResult] = results;

    if (rosterResult.status === "fulfilled") {
      setRoster(Array.isArray(rosterResult.value?.roster) ? rosterResult.value.roster : []);
    } else {
      setRoster([]);
    }

    if (scheduleResult.status === "fulfilled") {
      setScheduleRows(Array.isArray(scheduleResult.value?.rows) ? scheduleResult.value.rows : []);
    } else {
      setScheduleRows([]);
    }

    if (interviewResult.status === "fulfilled") {
      setInterviews(Array.isArray(interviewResult.value?.interviews) ? interviewResult.value.interviews : []);
    } else {
      setInterviews([]);
    }

    if (timeOffResult.status === "fulfilled") {
      setPendingRequests(Array.isArray(timeOffResult.value?.pending) ? timeOffResult.value.pending : []);
    } else {
      setPendingRequests([]);
    }

    if (readinessResult.status === "fulfilled") {
      setNoticeResignations(
        Array.isArray(readinessResult.value?.notice_resignations)
          ? readinessResult.value.notice_resignations
          : []
      );
    } else {
      setNoticeResignations(null);
    }

    setUnavailableSignals(results.filter((result) => result.status === "rejected").length);
    setLoading(false);
  }, [slug, today]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      void load();
    }, 0);

    return () => window.clearTimeout(initialLoad);
  }, [load]);

  const posture = useMemo(() => {
    const active = roster.filter((row) => row.employment_status === "Active");

    return {
      drivers: active.filter((row) => isDriverRole(row.worker_type)).length,
      leadership: active.filter((row) => isLeadershipRole(row.worker_type)).length,
      support: active.filter(
        (row) => !isDriverRole(row.worker_type) && !isLeadershipRole(row.worker_type)
      ).length,
      trainees: roster.filter(
        (row) => row.employment_status === "Trainee" && isDriverRole(row.worker_type)
      ).length,
      candidates: roster.filter(
        (row) => row.employment_status === "Candidate" && isDriverRole(row.worker_type)
      ).length,
      former: roster.filter(
        (row) => row.employment_status === "Former" && isDriverRole(row.worker_type)
      ).length,
    };
  }, [roster]);

  const todaySchedule = useMemo(
    () => uniqueScheduleRows(scheduleRows.filter((row) => row.service_date === today)),
    [scheduleRows, today]
  );
  const scheduledToday = todaySchedule.filter((row) => row.planned_on);
  const offToday = todaySchedule.filter((row) => !row.planned_on);
  const approvedTimeOffToday = todaySchedule.filter(
    (row) => row.override_type === "TIME_OFF"
  );
  const scheduleChanges = todaySchedule.filter((row) => Boolean(row.override_type));
  const pendingToday = pendingRequests.filter((request) =>
    request.requested_dates?.includes(today)
  );
  const todayInterviews = useMemo(
    () => interviews
      .filter(
        (interview) =>
          interview.interview_status === "scheduled" &&
          dateTimeIsoDate(interview.starts_at) === today
      )
      .sort((left, right) =>
        String(left.starts_at ?? "").localeCompare(String(right.starts_at ?? ""))
      ),
    [interviews, today]
  );

  const displayDate = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());
  const postureTotal = posture.drivers + posture.leadership + posture.support +
    posture.trainees + posture.candidates + posture.former;
  const postureRows = [
    { label: "Active drivers", value: posture.drivers },
    { label: "Leadership", value: posture.leadership },
    ...(posture.support > 0 ? [{ label: "Support", value: posture.support }] : []),
    { label: "Driver trainees", value: posture.trainees },
    { label: "Driver candidates", value: posture.candidates },
    { label: "Former drivers", value: posture.former },
  ];
  const retentionWindows = ([30, 60, 90] as const).map((days) =>
    retentionWindow(roster, today, days)
  );
  const nextNoticeResignation = noticeResignations?.[0];
  const noticeResignationDetail = loading
    ? "Checking active notices"
    : noticeResignations == null
      ? "Signal temporarily unavailable"
      : nextNoticeResignation
        ? `Next final scheduled day ${shortDateLabel(nextNoticeResignation.last_scheduled_date)} · ${nextNoticeResignation.days_until_last_day} ${nextNoticeResignation.days_until_last_day === 1 ? "day" : "days"}`
        : "No active notices";

  return (
    <main className="workspace-shell">
      <section className={`workspace-main ${styles.page}`}>
        <header className={styles.briefingHeader}>
          <div>
            <p className="eyebrow">People · Today</p>
            <h1 className="workspace-title">Your workforce at a glance</h1>
            <p className="workspace-subtitle">
              {displayDate} · A live view of staffing, interviews, and time away.
            </p>
          </div>
          <div className={styles.liveStatus} aria-label={loading ? "People briefing loading" : "People briefing current"}>
            <span className={loading ? styles.liveDotLoading : styles.liveDot} />
            <span>{loading ? "Syncing today" : "Today is current"}</span>
          </div>
        </header>

        {unavailableSignals > 0 ? (
          <p className={styles.notice}>
            {unavailableSignals} live signal{unavailableSignals === 1 ? " is" : "s are"} temporarily unavailable. The remaining People view is current.
          </p>
        ) : null}

        <section className={styles.commandSurface} aria-label="Today's workforce briefing">
          <div className={styles.dailyGrid}>
            <DailyMetric
              icon={<UserRoundCheck size={20} />}
              label="Scheduled today"
              value={scheduledToday.length}
              detail={todaySchedule.length ? `${todaySchedule.length} people resolved in today's schedule` : "No schedule published today"}
              tone="positive"
            />
            <DailyMetric
              icon={<UserRoundX size={20} />}
              label="Off today"
              value={offToday.length}
              detail={offToday.length ? "Not planned on after today's rules" : "No planned absences"}
            />
            <DailyMetric
              icon={<Clock3 size={20} />}
              label="Interview burden"
              value={todayInterviews.length}
              detail={interviewBurden(todayInterviews)}
            />
            <DailyMetric
              icon={<Umbrella size={20} />}
              label="Approved time off"
              value={approvedTimeOffToday.length}
              detail={pendingToday.length ? `${pendingToday.length} request${pendingToday.length === 1 ? "" : "s"} still awaiting a decision` : "Time-off overrides applied today"}
              tone={pendingToday.length ? "warning" : "default"}
            />
          </div>

          <div className={styles.intelligenceGrid}>
            <section className={styles.intelligencePanel}>
              <div className={styles.panelHeading}>
                <p className="eyebrow">Workforce posture</p>
                <h2>Driver workforce</h2>
              </div>
              <div className={styles.postureList}>
                {postureRows.map((row) => (
                  <div className={styles.postureRow} key={row.label}>
                    <span>{row.label}</span>
                    <progress max={Math.max(1, postureTotal)} value={row.value} aria-label={`${row.label}: ${row.value}`} />
                    <strong>{row.value}</strong>
                  </div>
                ))}
              </div>
              <div className={styles.postureSummary}>
                <Users size={17} />
                <span>
                  <strong>{posture.drivers}</strong> active drivers
                  {posture.leadership > 0 ? ` · ${posture.leadership} leadership` : ""}
                </span>
              </div>
              <div className={styles.noticeDatum} data-signal="NOTICE_RESIGNATION">
                <span>Resignation notice</span>
                <strong>{noticeResignations == null ? "—" : noticeResignations.length}</strong>
                <small>{noticeResignationDetail}</small>
              </div>
            </section>

            <section className={styles.intelligencePanel}>
              <div className={styles.panelHeading}>
                <p className="eyebrow">Interview agenda</p>
                <h2>Calls today</h2>
              </div>
              <div className={styles.agendaList}>
                {todayInterviews.slice(0, 4).map((interview) => (
                  <div className={styles.agendaRow} key={interview.id}>
                    <span className={styles.agendaTime}>{timeLabel(interview.starts_at)}</span>
                    <span className={styles.agendaPerson}>
                      <strong>{interviewName(interview)}</strong>
                      <small>{interview.phone || interview.email || (interview.meeting_provider === "in_person" ? "In person" : "Phone interview")}</small>
                    </span>
                  </div>
                ))}
                {!loading && todayInterviews.length === 0 ? (
                  <p className={styles.empty}>No interviews are scheduled today.</p>
                ) : null}
                {loading ? <p className={styles.empty}>Loading today’s agenda…</p> : null}
              </div>
            </section>

            <section className={`${styles.intelligencePanel} ${styles.widePanel} ${styles.retentionPanel}`}>
              <div className={styles.retentionHeading}>
                <div>
                  <p className="eyebrow">Driver churn posture</p>
                  <h2>Retention movement · 30 / 60 / 90 days</h2>
                </div>
                <p>Score basis: activations ÷ total driver movement · 50 is one activation per departure</p>
              </div>
              <div className={styles.retentionGrid}>
                {retentionWindows.map((window) => (
                  <div className={styles.retentionWindow} key={window.days}>
                    <div className={styles.retentionWindowTop}>
                      <span>{window.days} days</span>
                      <small className={styles[`retention_${window.posture}`]}>
                        {retentionPostureLabel(window.posture)}
                      </small>
                    </div>
                    <div className={styles.retentionScore}>
                      <strong>{window.score ?? "—"}</strong>
                      <span>{window.score == null ? "No score" : "posture score"}</span>
                    </div>
                    <div className={styles.retentionFlow}>
                      <span><strong>+{window.activations}</strong> activated</span>
                      <span><strong>−{window.departures}</strong> departed</span>
                    </div>
                    <p>{window.factor}</p>
                  </div>
                ))}
              </div>
              <p className={styles.retentionBasis}>
                Driver activations use the effective hire date; departures use the effective separation date. Lead Drivers are included.
              </p>
            </section>

            <section className={`${styles.intelligencePanel} ${styles.widePanel}`}>
              <div className={styles.panelHeading}>
                <p className="eyebrow">Today’s adjustments</p>
                <h2>Schedule changes already applied</h2>
              </div>
              <div className={styles.changeGrid}>
                {scheduleChanges.map((row) => (
                  <div className={styles.changeRow} key={`${row.roster_member_id}:${row.override_type}`}>
                    <span className={styles.changeBadge}>{String(row.override_type).replaceAll("_", " ")}</span>
                    <strong>{row.full_name || "Roster member"}</strong>
                    <span>{row.planned_on ? row.route_name || "Added to today’s schedule" : "Off today"}</span>
                  </div>
                ))}
                {!loading && scheduleChanges.length === 0 ? (
                  <p className={styles.empty}>No schedule overrides affect today.</p>
                ) : null}
                {loading ? <p className={styles.empty}>Loading today’s changes…</p> : null}
              </div>
            </section>
          </div>
        </section>
      </section>
    </main>
  );
}
