"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { CalendarPlus, Mail, Phone, X } from "lucide-react";
import styles from "../hiring-workspace.module.css";

export type InterviewCandidate = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string | null;
  role_interest?: string | null;
  location_interest?: string | null;
  application_status: string;
};

export type ManualInterviewDraft = {
  entryMode: "existing" | "manual";
  applicationId: string;
  intervieweeName: string;
  intervieweeEmail: string;
  intervieweePhone: string;
  startsAt: string;
  durationMinutes: number;
  meetingProvider: string;
  meetingUrl: string;
  slotId?: string | null;
  interviewId?: string | null;
};

type Props = {
  candidates: InterviewCandidate[];
  initial: ManualInterviewDraft;
  saving: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (draft: ManualInterviewDraft) => Promise<void>;
};

export default function ManualInterviewOverlay(props: Props) {
  const { candidates, initial, saving, error, onClose, onSubmit } = props;
  const [entryMode, setEntryMode] = useState<"existing" | "manual">(initial.entryMode);
  const [applicationId, setApplicationId] = useState(initial.applicationId);
  const [intervieweeName, setIntervieweeName] = useState(initial.intervieweeName);
  const [intervieweeEmail, setIntervieweeEmail] = useState(initial.intervieweeEmail);
  const [intervieweePhone, setIntervieweePhone] = useState(initial.intervieweePhone);
  const [startsAt, setStartsAt] = useState(initial.startsAt);
  const [durationMinutes, setDurationMinutes] = useState(initial.durationMinutes);
  const [meetingProvider, setMeetingProvider] = useState(initial.meetingProvider);
  const [meetingUrl, setMeetingUrl] = useState(initial.meetingUrl);
  const [slotId, setSlotId] = useState<string | null>(initial.slotId ?? null);
  const [interviewId] = useState<string | null>(initial.interviewId ?? null);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, saving]);

  const candidate = useMemo(
    () => candidates.find((item) => item.id === applicationId) ?? null,
    [applicationId, candidates],
  );

  function detachFromPublishedSlot() {
    setSlotId(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit({
      entryMode,
      applicationId: entryMode === "existing" ? applicationId : "",
      intervieweeName: entryMode === "manual" ? intervieweeName : "",
      intervieweeEmail: entryMode === "manual" ? intervieweeEmail : "",
      intervieweePhone: entryMode === "manual" ? intervieweePhone : "",
      startsAt,
      durationMinutes,
      meetingProvider,
      meetingUrl,
      slotId,
      interviewId,
    });
  }

  return (
    <div
      className={styles.interviewOverlayBackdrop}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <section
        aria-labelledby="manual-interview-title"
        aria-modal="true"
        className={styles.interviewOverlay}
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className={styles.interviewOverlayHeader}>
          <div className={styles.overlayIcon}><CalendarPlus size={20} /></div>
          <div>
            <p className={styles.eyebrow}>Manual appointment</p>
            <h2 id="manual-interview-title">{interviewId ? "Update interview" : "Add interview to agenda"}</h2>
            <p>Choose the candidate and load the appointment details for the team.</p>
          </div>
          <button aria-label="Close interview editor" className={styles.overlayClose} disabled={saving} onClick={onClose} type="button"><X size={18} /></button>
        </header>

        <form className={styles.interviewOverlayForm} onSubmit={submit}>
          <div className={styles.intervieweeMode}>
            <button className={entryMode === "manual" ? styles.intervieweeModeActive : ""} onClick={() => setEntryMode("manual")} type="button">Manual entry</button>
            <button className={entryMode === "existing" ? styles.intervieweeModeActive : ""} disabled={!candidates.length} onClick={() => setEntryMode("existing")} type="button">Existing candidate</button>
          </div>

          {entryMode === "existing" ? (
            <>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Interviewee</span>
                <select className={styles.control} required value={applicationId} onChange={(event) => setApplicationId(event.target.value)}>
                  <option value="">Choose a candidate</option>
                  {candidates.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.first_name} {item.last_name}{item.role_interest ? ` · ${item.role_interest}` : ""}
                    </option>
                  ))}
                </select>
              </label>

              {candidate ? (
                <section className={styles.intervieweeCard}>
                  <div>
                    <span>Candidate</span>
                    <strong>{candidate.first_name} {candidate.last_name}</strong>
                    <small>{[candidate.role_interest, candidate.location_interest].filter(Boolean).join(" · ") || "Candidate journey"}</small>
                  </div>
                  <div className={styles.intervieweeContacts}>
                    <a href={`mailto:${candidate.email}`}><Mail size={15} /><span>{candidate.email}</span></a>
                    {candidate.phone ? <a href={`tel:${candidate.phone}`}><Phone size={15} /><span>{candidate.phone}</span></a> : <span className={styles.contactMissing}><Phone size={15} /> No phone provided</span>}
                  </div>
                </section>
              ) : (
                <p className={styles.overlayHint}>Select an interviewee to see their contact details.</p>
              )}
            </>
          ) : (
            <section className={styles.manualIntervieweeFields}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Interviewee name</span>
                <input autoFocus className={styles.control} required value={intervieweeName} onChange={(event) => setIntervieweeName(event.target.value)} />
              </label>
              <div className={styles.formGridTwo}>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Email</span>
                  <input className={styles.control} inputMode="email" type="email" value={intervieweeEmail} onChange={(event) => setIntervieweeEmail(event.target.value)} />
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Phone</span>
                  <input className={styles.control} inputMode="tel" type="tel" value={intervieweePhone} onChange={(event) => setIntervieweePhone(event.target.value)} />
                </label>
              </div>
              <p className={styles.fieldHint}>Contact details stay with this appointment. The candidate can join the full Foyer journey later.</p>
            </section>
          )}

          {slotId ? <p className={styles.slotNotice}>This appointment is using the published time you selected. Editing its details will convert it to a direct appointment.</p> : null}

          <div className={styles.formGridTwo}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Date and time</span>
              <input className={styles.control} required type="datetime-local" value={startsAt} onChange={(event) => { setStartsAt(event.target.value); detachFromPublishedSlot(); }} />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Length</span>
              <select className={styles.control} value={durationMinutes} onChange={(event) => { setDurationMinutes(Number(event.target.value)); detachFromPublishedSlot(); }}>
                <option value={15}>15 minutes</option>
                <option value={30}>30 minutes</option>
                <option value={45}>45 minutes</option>
                <option value={60}>60 minutes</option>
              </select>
            </label>
          </div>

          <div className={styles.formGridTwo}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Interview place</span>
              <select className={styles.control} value={meetingProvider} onChange={(event) => { setMeetingProvider(event.target.value); detachFromPublishedSlot(); }}>
                <option value="insight">Insight interview room</option>
                <option value="phone">Phone</option>
                <option value="google_meet">Google Meet</option>
                <option value="microsoft_teams">Microsoft Teams</option>
                <option value="in_person">In person</option>
              </select>
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Link or instructions</span>
              <input className={styles.control} placeholder="Optional" value={meetingUrl} onChange={(event) => { setMeetingUrl(event.target.value); detachFromPublishedSlot(); }} />
            </label>
          </div>

          {error ? <p className={styles.feedbackError}>{error}</p> : null}

          <div className={styles.interviewOverlayActions}>
            <button className="button" disabled={saving} onClick={onClose} type="button">Cancel</button>
            <button className="button button-primary" disabled={saving || !startsAt || (entryMode === "existing" ? !applicationId : !intervieweeName.trim())} type="submit">
              {saving ? "Saving…" : interviewId ? "Update appointment" : "Add to agenda"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
