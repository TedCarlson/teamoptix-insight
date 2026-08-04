"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, Clock3 } from "lucide-react";
import ManualInterviewOverlay, {
  type InterviewCandidate,
  type ManualInterviewDraft,
} from "../components/ManualInterviewOverlay";
import styles from "../hiring-workspace.module.css";

type Slot = {
  id: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  slot_status: string;
  meeting_provider: string;
  meeting_url?: string | null;
  interviewer_name?: string | null;
};

type Interview = Slot & {
  application_id?: string | null;
  slot_id?: string | null;
  first_name: string;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  role_interest?: string | null;
  location_interest?: string | null;
  interview_status: string;
  meeting_url?: string | null;
  manual_name?: string | null;
  bypass_reason?: string | null;
  next_step?: string | null;
};

type LeadershipRole = {
  role_key: string;
  roster_member_id?: string | null;
};

type InterviewOwner = {
  role_key?: string | null;
  full_name?: string | null;
};

const dayOptions = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
];

function startOfWeek(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  return date;
}

function addDays(value: Date, days: number) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

function sameDay(left: Date | string, right: Date | string) {
  const a = new Date(left);
  const b = new Date(right);
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function dateTimeInputValue(value: Date | string) {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function suggestedStart(day: Date) {
  const now = new Date();
  const start = new Date(day);
  if (sameDay(start, now)) {
    start.setTime(Math.ceil((now.getTime() + 5 * 60_000) / (30 * 60_000)) * 30 * 60_000);
  } else {
    start.setHours(10, 0, 0, 0);
  }
  return start;
}

function supportedInterviewFormat(value?: string | null) {
  return value === "in_person" ? "in_person" : "phone";
}

function ownerInitials(name?: string | null) {
  return (name || "HR").split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

export default function HiringInterviewsPage() {
  const slug = String(useParams()?.slug ?? "");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [candidates, setCandidates] = useState<InterviewCandidate[]>([]);
  const [roles, setRoles] = useState<LeadershipRole[]>([]);
  const [responsible, setResponsible] = useState<InterviewOwner | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"week" | "day">("week");
  const [cursor, setCursor] = useState(() => new Date());
  const [scheduleDays, setScheduleDays] = useState<number[]>([2, 4]);
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("12:00");
  const [duration, setDuration] = useState(30);
  const [weeks, setWeeks] = useState(4);
  const [manualDraft, setManualDraft] = useState<ManualInterviewDraft | null>(null);
  const [manualError, setManualError] = useState("");

  const load = useCallback(async () => {
    const response = await fetch(`/api/company/${slug}/people/interviews`, {
      cache: "no-store",
      credentials: "include",
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Unable to load interview agenda.");
    setSlots(body.slots || []);
    setInterviews(body.interviews || []);
    setCandidates((body.applications || []).filter((item: InterviewCandidate) => !["declined", "withdrawn"].includes(item.application_status)));
    setRoles(body.leadership?.roles || []);
    setResponsible(body.owner || null);
  }, [slug]);

  useEffect(() => {
    if (slug) void load().catch((reason) => setError(reason.message));
  }, [load, slug]);

  useEffect(() => {
    if (window.matchMedia("(max-width: 820px)").matches) setView("day");
  }, []);

  const hr = roles.find((role) => role.role_key === "hr");
  const weekStart = useMemo(() => startOfWeek(cursor), [cursor]);
  const visibleDays = useMemo(
    () => view === "day" ? [new Date(cursor)] : Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)),
    [cursor, view, weekStart],
  );
  const openSlots = slots.filter((slot) => slot.slot_status === "open");

  async function post(payload: Record<string, unknown>) {
    const response = await fetch(`/api/company/${slug}/people/interviews`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Unable to update the interview agenda.");
    return body;
  }

  function openDay(day: Date) {
    setManualError("");
    setManualDraft({
      entryMode: "manual",
      applicationId: "",
      intervieweeName: "",
      intervieweeEmail: "",
      intervieweePhone: "",
      startsAt: dateTimeInputValue(suggestedStart(day)),
      durationMinutes: 30,
      meetingProvider: "phone",
      meetingUrl: "",
      slotId: null,
      interviewId: null,
    });
  }

  function openSlot(slot: Slot) {
    setManualError("");
    setManualDraft({
      entryMode: "manual",
      applicationId: "",
      intervieweeName: "",
      intervieweeEmail: "",
      intervieweePhone: "",
      startsAt: dateTimeInputValue(slot.starts_at),
      durationMinutes: Math.max(15, Math.round((new Date(slot.ends_at).getTime() - new Date(slot.starts_at).getTime()) / 60_000)),
      meetingProvider: supportedInterviewFormat(slot.meeting_provider),
      meetingUrl: slot.meeting_url || "",
      slotId: slot.id,
      interviewId: null,
    });
  }

  function openInterview(interview: Interview) {
    setManualError("");
    setManualDraft({
      entryMode: interview.application_id ? "existing" : "manual",
      applicationId: interview.application_id || "",
      intervieweeName: interview.manual_name || [interview.first_name, interview.last_name].filter(Boolean).join(" "),
      intervieweeEmail: interview.email || "",
      intervieweePhone: interview.phone || "",
      startsAt: dateTimeInputValue(interview.starts_at),
      durationMinutes: Math.max(15, Math.round((new Date(interview.ends_at).getTime() - new Date(interview.starts_at).getTime()) / 60_000)),
      meetingProvider: supportedInterviewFormat(interview.meeting_provider),
      meetingUrl: interview.meeting_url || "",
      slotId: interview.slot_id ?? null,
      interviewId: interview.id,
    });
  }

  async function saveManualInterview(draft: ManualInterviewDraft) {
    setBusy(true);
    setManualError("");
    try {
      await post({
        mode: "manual",
        ...draft,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      await load();
      setManualDraft(null);
      setMessage(draft.interviewId ? "Interview appointment updated." : "Interview added to the team agenda.");
    } catch (reason) {
      setManualError(reason instanceof Error ? reason.message : "Unable to save the interview appointment.");
    } finally {
      setBusy(false);
    }
  }

  async function publishBaseline(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const fields = new FormData(event.currentTarget);
    const [startHour, startMinute] = startTime.split(":").map(Number);
    const [endHour, endMinute] = endTime.split(":").map(Number);
    const nextWeek = startOfWeek(new Date());
    const generated: Array<{ starts_at: string; ends_at: string }> = [];

    for (let week = 0; week < weeks; week += 1) {
      for (const day of scheduleDays) {
        const date = addDays(nextWeek, week * 7 + day - 1);
        const windowStart = new Date(date);
        windowStart.setHours(startHour, startMinute, 0, 0);
        const windowEnd = new Date(date);
        windowEnd.setHours(endHour, endMinute, 0, 0);
        for (let starts = windowStart.getTime(); starts + duration * 60_000 <= windowEnd.getTime(); starts += duration * 60_000) {
          generated.push({
            starts_at: new Date(starts).toISOString(),
            ends_at: new Date(starts + duration * 60_000).toISOString(),
          });
        }
      }
    }

    if (!scheduleDays.length || !generated.length) {
      setError("Choose at least one day and a window long enough for an interview.");
      setBusy(false);
      return;
    }

    try {
      const result = await post({
        mode: "baseline",
        slots: generated,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        meetingProvider: fields.get("meetingProvider"),
        meetingUrl: fields.get("meetingUrl"),
      });
      await load();
      setMessage(`${result.created} interview times published across the next ${weeks} weeks.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to publish the interview window.");
    } finally {
      setBusy(false);
    }
  }

  function move(direction: number) {
    setCursor((current) => addDays(current, direction * (view === "week" ? 7 : 1)));
  }

  return (
    <main className="workspace-shell">
      <section className={`workspace-main ${styles.stack}`}>
        <header className={`workspace-header ${styles.pageHeader}`}>
          <div className="workspace-header__copy">
            <p className={styles.eyebrow}>People · Hiring</p>
            <h1 className="workspace-title">Interview Agenda</h1>
            <p className="workspace-subtitle">
              Establish when the team interviews, publish reservable times, and see the week without leaving Insight.
            </p>
          </div>
          <div className={styles.summaryStrip}>
            <div className={styles.summaryItem}><span>Open times</span><strong>{openSlots.length}</strong></div>
            <div className={styles.summaryItem}><span>Scheduled</span><strong>{interviews.filter((item) => item.interview_status === "scheduled").length}</strong></div>
            <div className={styles.summaryItem}><span>Owner</span><strong>{responsible?.full_name?.split(" ")[0] || "Set HR"}</strong></div>
          </div>
        </header>

        {error ? <p className={styles.feedbackError}>{error}</p> : null}
        {message ? <p className={styles.feedback}>{message}</p> : null}

        <section className={styles.ownerStrip}>
          <div className={styles.ownerAvatar}>{ownerInitials(responsible?.full_name)}</div>
          <div>
            <p className={styles.eyebrow}>Interview owner</p>
            <h2>{responsible?.full_name || "Connect an interview owner"}</h2>
            <p>
              {responsible?.role_key === "hr"
                ? "HR receives new interview availability and candidate follow-up."
                : responsible?.role_key === "business_contact"
                  ? "Business Contact is the fallback until HR is connected."
                  : hr?.roster_member_id
                    ? "HR is assigned but still needs an app profile connection."
                    : "Assign HR in Leadership; Business Contact remains the fallback."}
            </p>
          </div>
          <Link className="button" href={`/company/${slug}/config/leadership`}>Manage owner</Link>
        </section>

        <section>
          <article className={styles.surface}>
            <div className={styles.surfaceHeader}>
              <div>
                <p className={styles.eyebrow}>Baseline schedule</p>
                <h2>Publish a repeatable interview window</h2>
                <p>Choose normal interview days once and Insight creates candidate-ready times.</p>
              </div>
            </div>
            <div className={styles.surfaceBody}>
              <form className={styles.formStack} onSubmit={publishBaseline}>
                <section className={styles.formSection}>
                  <h3 className={styles.formSectionTitle}>Interview days</h3>
                  <div className={styles.dayPicker}>
                    {dayOptions.map((day) => {
                      const active = scheduleDays.includes(day.value);
                      return <button key={day.value} type="button" className={active ? styles.dayButtonActive : styles.dayButton} onClick={() => setScheduleDays((current) => active ? current.filter((value) => value !== day.value) : [...current, day.value].sort())}>{day.label}</button>;
                    })}
                  </div>
                </section>
                <div className={styles.formGridFour}>
                  <label className={styles.field}><span className={styles.fieldLabel}>From</span><input className={styles.control} type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></label>
                  <label className={styles.field}><span className={styles.fieldLabel}>Until</span><input className={styles.control} type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} /></label>
                  <label className={styles.field}><span className={styles.fieldLabel}>Call length</span><select className={styles.control} value={duration} onChange={(event) => setDuration(Number(event.target.value))}><option value={15}>15 min</option><option value={30}>30 min</option><option value={45}>45 min</option><option value={60}>60 min</option></select></label>
                  <label className={styles.field}><span className={styles.fieldLabel}>Publish ahead</span><select className={styles.control} value={weeks} onChange={(event) => setWeeks(Number(event.target.value))}><option value={2}>2 weeks</option><option value={4}>4 weeks</option><option value={6}>6 weeks</option></select></label>
                </div>
                <div className={styles.formGridTwo}>
                  <label className={styles.field}><span className={styles.fieldLabel}>Interview format</span><select className={styles.control} name="meetingProvider" defaultValue="phone"><option value="phone">Phone</option><option value="in_person">In person</option></select></label>
                  <label className={styles.field}><span className={styles.fieldLabel}>Phone or arrival instructions</span><input className={styles.control} name="meetingUrl" placeholder="Optional" /></label>
                </div>
                <div className={styles.formActions}><button className={`button button-primary ${styles.primaryAction}`} disabled={busy} type="submit">{busy ? "Publishing…" : "Publish interview window"}</button></div>
              </form>
            </div>
          </article>

        </section>

        <section className={styles.surface}>
          <div className={styles.agendaToolbar}>
            <div>
              <p className={styles.eyebrow}>Candidate agenda</p>
              <h2>{view === "week" ? `Week of ${weekStart.toLocaleDateString(undefined, { month: "long", day: "numeric" })}` : cursor.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</h2>
            </div>
            <div className={styles.agendaControls}>
              <button className="button button-primary" type="button" onClick={() => openDay(cursor)}><CalendarPlus size={16} /> Add interview</button>
              <button className="button" type="button" aria-label="Previous" onClick={() => move(-1)}><ChevronLeft size={16} /></button>
              <button className="button" type="button" onClick={() => setCursor(new Date())}>Today</button>
              <button className="button" type="button" aria-label="Next" onClick={() => move(1)}><ChevronRight size={16} /></button>
              <div className={styles.viewToggle}>
                <button type="button" className={view === "week" ? styles.viewToggleActive : ""} onClick={() => setView("week")}>Week</button>
                <button type="button" className={view === "day" ? styles.viewToggleActive : ""} onClick={() => setView("day")}>Day</button>
              </div>
            </div>
          </div>
          <div className={view === "day" ? styles.agendaDay : styles.agendaWeek}>
            {visibleDays.map((day) => {
              const dayInterviews = interviews.filter((item) => item.starts_at && sameDay(item.starts_at, day));
              const daySlots = openSlots.filter((item) => sameDay(item.starts_at, day));
              return (
                <section className={styles.agendaColumn} key={day.toISOString()}>
                  <button className={sameDay(day, new Date()) ? styles.agendaDateToday : styles.agendaDate} type="button" title="Add an interview on this day" onClick={() => openDay(day)}>
                    <span>{day.toLocaleDateString(undefined, { weekday: "short" })}</span>
                    <strong>{day.getDate()}</strong>
                  </button>
                  <div className={styles.agendaEvents}>
                    {dayInterviews.map((item) => (
                      <button className={styles.agendaInterview} key={item.id} type="button" onClick={() => openInterview(item)}>
                        <span><Clock3 size={12} /> {timeLabel(item.starts_at)}</span>
                        <strong>{item.first_name} {item.last_name}</strong>
                        <small>{item.role_interest || "Introductory interview"}</small>
                        <small>{item.phone || item.email}</small>
                      </button>
                    ))}
                    {daySlots.map((slot) => (
                      <button className={styles.agendaOpen} key={slot.id} type="button" onClick={() => openSlot(slot)}>
                        <span><CalendarDays size={12} /> {timeLabel(slot.starts_at)}</span>
                        <strong>Available</strong>
                        <small>Assign candidate</small>
                      </button>
                    ))}
                    {!dayInterviews.length && !daySlots.length ? <p className={styles.agendaEmpty}>No interviews</p> : null}
                    <button className={styles.agendaAdd} type="button" onClick={() => openDay(day)}><CalendarPlus size={13} /> Schedule</button>
                  </div>
                </section>
              );
            })}
          </div>
        </section>

        {manualDraft ? (
          <ManualInterviewOverlay
            candidates={candidates}
            error={manualError}
            initial={manualDraft}
            onClose={() => { setManualDraft(null); setManualError(""); }}
            onSubmit={saveManualInterview}
            saving={busy}
          />
        ) : null}
      </section>
    </main>
  );
}
