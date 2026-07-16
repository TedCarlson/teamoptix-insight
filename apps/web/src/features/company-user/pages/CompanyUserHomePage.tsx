"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useAccess } from "@/features/access/AccessProvider";
import { DriverMobileShell } from "@/features/driver/shell/DriverMobileShell";
import {
  resolveDriverWorkdayPresentation,
  type DriverWorkdayState,
} from "@/features/driver/language/workday";
import {
  DriverSchedulePreviewCard,
  type DriverSchedulePreviewDay,
} from "@/features/company-user/components/DriverSchedulePreviewCard";
import {
  IntentVerificationDrawer,
  type IntentVerificationAction,
} from "@/features/security/components/IntentVerificationDrawer";
import type { RosterComplianceSignal } from "@/features/compliance/lib/rosterCompliance";

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


type ActivityCurrentResponse = {
  ok?: boolean;
  state?: "CLOCKED_IN" | "CLOCKED_OUT" | string;
  lastClockIn?: { occurred_at: string } | null;
  lastClockOut?: { occurred_at: string } | null;
};

type TimekeepingDiscrepancy = {
  id: string;
  type: "MISSING_CLOCK_OUT";
  service_date: string;
  clock_in: string;
  title: string;
  message: string;
};

type TimekeepingDiscrepancyResponse = {
  ok?: boolean;
  oversightMode?: string;
  discrepancies?: TimekeepingDiscrepancy[];
  error?: string;
};

type DriverMessage = {
  id: string;
  title: string;
  body: string;
  status: "published" | string;
  visibility: "all" | "drivers" | "leadership" | string;
  requires_ack: boolean;
  published_at: string | null;
};

const routeByDayKey: Record<number, keyof ScheduleRow> = {
  0: "default_route_u",
  1: "default_route_m",
  2: "default_route_t",
  3: "default_route_w",
  4: "default_route_h",
  5: "default_route_f",
  6: "default_route_s",
};

const presetWorksByDayKey: Record<number, keyof ScheduleRow> = {
  0: "preset_works_u",
  1: "preset_works_m",
  2: "preset_works_t",
  3: "preset_works_w",
  4: "preset_works_h",
  5: "preset_works_f",
  6: "preset_works_s",
};

const rotationWorksByDayKey: Record<number, keyof ScheduleRow> = {
  0: "rotation_works_u",
  1: "rotation_works_m",
  2: "rotation_works_t",
  3: "rotation_works_w",
  4: "rotation_works_h",
  5: "rotation_works_f",
  6: "rotation_works_s",
};

function isScheduledForDate(row: ScheduleRow | null, date: Date) {
  if (!row || row.schedule_pending) return false;

  const presetKey = presetWorksByDayKey[date.getDay()];
  const rotationKey = rotationWorksByDayKey[date.getDay()];

  return row[rotationKey] === true || row[presetKey] === true;
}

function getBrowserLocation(): Promise<{
  latitude: number;
  longitude: number;
  accuracy_meters: number | null;
  device_captured_at: string;
} | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy_meters: Number.isFinite(position.coords.accuracy)
            ? position.coords.accuracy
            : null,
          device_captured_at: new Date(position.timestamp).toISOString(),
        });
      },
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    );
  });
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

function buildSchedulePreview(row: ScheduleRow | null): DriverSchedulePreviewDay[] {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index);

    const dayCodes = ["U", "M", "T", "W", "H", "F", "S"];

    const label = index === 0 ? "Today" : dayCodes[date.getDay()];

    const scheduled = isScheduledForDate(row, date);
    const route = routeForDate(row, date);

    return {
      key: date.toISOString(),
      label,
      route: scheduled ? route ?? "ON" : "OFF",
      scheduled,
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

function formatDateLabel(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, (month ?? 1) - 1, day ?? 1);

  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function buildLocalTimestamp(serviceDate: string, timeValue: string) {
  if (!/^\d{2}:\d{2}$/.test(timeValue)) return null;

  const [year, month, day] = serviceDate.split("-").map(Number);
  const [hour, minute] = timeValue.split(":").map(Number);
  const date = new Date(year, (month ?? 1) - 1, day ?? 1, hour ?? 0, minute ?? 0);

  if (!Number.isFinite(date.getTime())) return null;

  return date.toISOString();
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
  const [timekeepingDiscrepancies, setTimekeepingDiscrepancies] = useState<TimekeepingDiscrepancy[]>([]);
  const [driverMessages, setDriverMessages] = useState<DriverMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [ackSavingId, setAckSavingId] = useState<string | null>(null);
  const [correctionTime, setCorrectionTime] = useState("");
  const [correctionNote, setCorrectionNote] = useState("");
  const [correctionSaving, setCorrectionSaving] = useState(false);
  const [clockConfirm, setClockConfirm] = useState<IntentVerificationAction | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [complianceSignals, setComplianceSignals] = useState<RosterComplianceSignal[]>([]);

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

  const loadTimekeepingDiscrepancies = useCallback(async () => {
    if (!slug) return;

    try {
      const res = await fetch(`/api/company/${slug}/driver/timekeeping/discrepancies`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as TimekeepingDiscrepancyResponse;

      if (!res.ok) {
        setTimekeepingDiscrepancies([]);
        return;
      }

      setTimekeepingDiscrepancies(Array.isArray(data.discrepancies) ? data.discrepancies : []);
    } catch {
      setTimekeepingDiscrepancies([]);
    }
  }, [slug]);

  const loadDriverMessages = useCallback(async () => {
    if (!slug) return;

    try {
      setMessagesLoading(true);

      const res = await fetch(`/api/company/${slug}/messages`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setDriverMessages([]);
        return;
      }

      setDriverMessages(Array.isArray(data.messages) ? data.messages : []);
    } catch {
      setDriverMessages([]);
    } finally {
      setMessagesLoading(false);
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
      void loadTimekeepingDiscrepancies();
      void loadDriverMessages();
      void fetch(`/api/company/${slug}/driver/compliance`, { credentials: "include", cache: "no-store" })
        .then((response) => response.json())
        .then((data) => setComplianceSignals(Array.isArray(data?.compliance_signals) ? data.compliance_signals : []))
        .catch(() => setComplianceSignals([]));
    }

    return () => {
      active = false;
    };
  }, [loadActivity, loadDriverMessages, loadTimekeepingDiscrepancies, slug]);

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

  const scheduledTodayForWorkday = isScheduledForDate(myScheduleRow, new Date());

  const workdayState: DriverWorkdayState = activityLoading
    ? "CHECKING"
    : isClockedIn
      ? "CLOCKED_IN"
      : loading
        ? "CHECKING"
        : scheduledTodayForWorkday && todayRoute
          ? "READY_TO_START"
          : scheduledTodayForWorkday
            ? "AWAITING_ASSIGNMENT"
            : "DAY_OFF";

  const workdayPresentation = resolveDriverWorkdayPresentation({
    state: workdayState,
    lastClockInTime,
    route: todayRoute,
  });

  const workdayTitle = workdayPresentation.title;
  const workdaySubtitle = workdayPresentation.message;
  const workdayAction = workdayPresentation.actionLabel;
  const primaryTimekeepingDiscrepancy = timekeepingDiscrepancies[0] ?? null;

  function handleWorkdayAction() {
    if (!slug || activitySaving || activityLoading || !workdayPresentation.actionEnabled) return;

    const eventType: IntentVerificationAction = isClockedIn ? "CLOCK_OUT" : "CLOCK_IN";
    setClockConfirm(eventType);
  }

  async function commitWorkdayAction() {
    if (!clockConfirm) return;
    if (!slug || activitySaving || activityLoading) return;

    const eventType = clockConfirm;

    try {
      setActivitySaving(true);

      const location = await getBrowserLocation();

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
            location_captured: Boolean(location),
          },
          location,
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

  async function acknowledgeMessage(messageId: string) {
    if (!slug || ackSavingId) return;

    try {
      setAckSavingId(messageId);
      setPageError(null);

      const res = await fetch(`/api/company/${slug}/messages/${messageId}/ack`, {
        method: "POST",
        credentials: "include",
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setPageError(data?.error ?? "Could not acknowledge message.");
        return;
      }

      setDriverMessages((current) =>
        current.filter((message) => message.id !== messageId)
      );
    } catch {
      setPageError("Could not acknowledge message.");
    } finally {
      setAckSavingId(null);
    }
  }

  async function submitTimekeepingCorrection() {
    if (!slug || !primaryTimekeepingDiscrepancy || correctionSaving) return;

    const clockOutAt = buildLocalTimestamp(
      primaryTimekeepingDiscrepancy.service_date,
      correctionTime
    );

    if (!clockOutAt) {
      setPageError("Enter a valid clock-out time.");
      return;
    }

    try {
      setCorrectionSaving(true);
      setPageError(null);

      const res = await fetch(`/api/company/${slug}/driver/timekeeping/corrections`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: primaryTimekeepingDiscrepancy.type,
          service_date: primaryTimekeepingDiscrepancy.service_date,
          clock_out_at: clockOutAt,
          driver_note: correctionNote,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setPageError(data?.error ?? "Could not submit timekeeping correction.");
        return;
      }

      setCorrectionTime("");
      setCorrectionNote("");
      await loadTimekeepingDiscrepancies();
      await loadActivity();
    } catch {
      setPageError("Could not submit timekeeping correction.");
    } finally {
      setCorrectionSaving(false);
    }
  }
  return (
    <DriverMobileShell slug={slug}>
      <section className="company-user-home">
        {pageError ? (
          <section className="app-card company-user-card">
            <p style={{ color: "#c62828", margin: 0 }}>{pageError}</p>
          </section>
        ) : null}


        {primaryTimekeepingDiscrepancy ? (
          <section className="app-card company-user-card">
            <div className="company-user-section-header">
              <div>
                <p className="value-card__eyebrow">Timekeeping needs attention</p>
                <h2>{primaryTimekeepingDiscrepancy.title}</h2>
              </div>
            </div>
            <p className="company-user-muted" style={{ marginTop: 8 }}>
              {primaryTimekeepingDiscrepancy.message}
            </p>
            <p className="company-user-muted" style={{ marginTop: 4 }}>
              Service date: {formatDateLabel(primaryTimekeepingDiscrepancy.service_date)} ·
              Clocked in: {formatTime(primaryTimekeepingDiscrepancy.clock_in) ?? "Recorded"}
            </p>

            <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
              <label className="context-stat__label" htmlFor="missing-clock-out-time">
                Clock-out time
              </label>
              <input
                id="missing-clock-out-time"
                type="time"
                className="workspace-input"
                value={correctionTime}
                disabled={correctionSaving}
                onChange={(event) => setCorrectionTime(event.target.value)}
              />

              <label className="context-stat__label" htmlFor="missing-clock-out-note">
                Optional note
              </label>
              <textarea
                id="missing-clock-out-note"
                className="workspace-input"
                rows={3}
                value={correctionNote}
                disabled={correctionSaving}
                onChange={(event) => setCorrectionNote(event.target.value)}
                placeholder="Add context if needed."
              />

              <button
                type="button"
                className="button button-primary"
                disabled={correctionSaving || !correctionTime}
                onClick={() => void submitTimekeepingCorrection()}
              >
                {correctionSaving ? "Submitting..." : "Submit correction"}
              </button>
            </div>
          </section>
        ) : null}

        <button
          type="button"
          className={`app-card company-user-card company-user-workday-card ${
            isClockedIn ? "company-user-workday-card--active" : ""
          }`}
          onClick={handleWorkdayAction}
          disabled={activitySaving || activityLoading || !workdayPresentation.actionEnabled}
          aria-label={workdayPresentation.actionEnabled ? workdayAction : workdayTitle}
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

        <DriverSchedulePreviewCard slug={slug} days={schedulePreview} />

        <section className="app-card company-user-card">
          <div className="company-user-section-header">
            <div>
              <p className="value-card__eyebrow">Company Updates</p>
              <h2>
                {messagesLoading
                  ? "Checking messages"
                  : driverMessages.length > 0
                    ? `${driverMessages.length} update${driverMessages.length === 1 ? "" : "s"}`
                    : "Nothing new right now"}
              </h2>
            </div>
          </div>

          {messagesLoading ? (
            <p className="company-user-muted">
              Loading broadcasts, reminders, and targeted company messages.
            </p>
          ) : driverMessages.length === 0 ? (
            <p className="company-user-muted">
              Broadcasts, reminders, incentives, and targeted company messages will appear here.
            </p>
          ) : (
            <div className="company-user-message-list">
              {driverMessages.map((message) => (
                <article className="company-user-message-card" key={message.id}>
                  <div>
                    <p className="value-card__eyebrow">
                      {message.visibility === "drivers" ? "Driver message" : "Company message"}
                    </p>
                    <h3>{message.title}</h3>
                    <p>{message.body}</p>
                  </div>

                  {message.requires_ack ? (
                    <button
                      type="button"
                      className="button button-primary"
                      disabled={ackSavingId === message.id}
                      onClick={() => void acknowledgeMessage(message.id)}
                    >
                      {ackSavingId === message.id ? "Acknowledging..." : "Read & acknowledge"}
                    </button>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="app-card company-user-card">
          <div className="company-user-section-header">
            <div>
              <p className="value-card__eyebrow">Compliance</p>
              <h2>{complianceSignals.length ? "Documents need attention" : "No urgent expirations"}</h2>
            </div>
          </div>
          {complianceSignals.length === 0 ? (
            <p className="company-user-muted">Your required documents are current.</p>
          ) : complianceSignals.map((signal) => (
            <article key={signal.documentType} style={{ borderTop: "1px solid #e6edf5", paddingTop: 10, marginTop: 10 }}>
              <strong>{signal.label}</strong>
              <p className="company-user-muted" style={{ margin: "4px 0" }}>
                {signal.status === "missing" ? "Document is missing" : signal.status === "expired" ? `Expired ${signal.expirationDate}` : `Expires in ${signal.daysRemaining} days · ${signal.expirationDate}`}
              </p>
              <strong style={{ color: "#b42318", fontSize: 13 }}>Update Required</strong>
            </article>
          ))}
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
    </DriverMobileShell>
  );
}
