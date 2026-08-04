"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Building2, MapPin } from "lucide-react";
import FoyerHeader from "@/features/foyer/components/FoyerHeader";
import styles from "@/features/hiring/hiring-workspace.module.css";
import type { CandidateFoyerExperience } from "../types";

type Props = { companySlug?: string; entryCode?: string };

type Submission = {
  application_id: string;
  claim_token?: string | null;
  profile_linked: boolean;
  application_status: string;
  scheduling_policy: string;
};

type CandidateCompany = {
  company_id: string;
  company_name: string;
  company_slug: string;
  logo_url?: string | null;
  headline?: string | null;
  summary?: string | null;
  terminal_name?: string | null;
  terminal_address?: string | null;
  primary_work_area?: string | null;
  industry_label?: string | null;
};

function displayDate(value: string, timezone?: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone || undefined,
  }).format(new Date(value));
}

function sourceLabel(source: CandidateFoyerExperience["entry"]["source_type"]) {
  if (source === "company_invite") return "Company invitation";
  if (source === "member_referral") return "Team member referral";
  if (source === "company_link") return "Company opportunity";
  return "Explore opportunities";
}

export default function CandidateFoyerPage({ companySlug, entryCode }: Props) {
  const [experience, setExperience] = useState<CandidateFoyerExperience | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [slotId, setSlotId] = useState("");
  const [showAllSlots, setShowAllSlots] = useState(false);
  const [showAllRequirements, setShowAllRequirements] = useState(false);
  const [candidateCompanies, setCandidateCompanies] = useState<CandidateCompany[]>([]);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileRef = useRef<HTMLDivElement | null>(null);
  const turnstileWidgetId = useRef<string | null>(null);
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_ENABLED === "true"
    ? process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ""
    : "";

  useEffect(() => {
    let active = true;
    const query = new URLSearchParams();
    if (companySlug) query.set("company", companySlug);
    if (entryCode) query.set("entry", entryCode);

    fetch(`/api/foyer/candidate-experience?${query.toString()}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "This candidate path is unavailable.");
        if (active) setExperience(payload);
      })
      .catch((reason) => active && setError(reason instanceof Error ? reason.message : "Unable to load this path."))
      .finally(() => active && setLoading(false));

    return () => { active = false; };
  }, [companySlug, entryCode]);

  useEffect(() => {
    setShowAllRequirements(!window.matchMedia("(max-width: 820px)").matches);
  }, []);

  useEffect(() => {
    if (companySlug || entryCode) return;
    let active = true;
    fetch("/api/foyer/candidate-companies", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Companies are unavailable.");
        if (active) setCandidateCompanies(payload.companies ?? []);
      })
      .catch(() => { if (active) setCandidateCompanies([]); });
    return () => { active = false; };
  }, [companySlug, entryCode]);

  useEffect(() => {
    if (!turnstileSiteKey || !turnstileRef.current) return;
    function render() {
      if (!window.turnstile || !turnstileRef.current || turnstileWidgetId.current) return;
      turnstileWidgetId.current = window.turnstile.render(turnstileRef.current, {
        sitekey: turnstileSiteKey,
        callback: setCaptchaToken,
        "expired-callback": () => setCaptchaToken(null),
        "error-callback": () => setCaptchaToken(null),
      });
    }
    if (window.turnstile) { render(); return; }
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://challenges.cloudflare.com/turnstile/v0/api.js"]');
    if (existing) { existing.addEventListener("load", render, { once: true }); return () => existing.removeEventListener("load", render); }
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js"; script.async = true; script.defer = true;
    script.addEventListener("load", render, { once: true }); document.body.appendChild(script);
    return () => script.removeEventListener("load", render);
  }, [turnstileSiteKey]);

  const required = useMemo(
    () => experience?.requirements.filter((item) => item.is_required) ?? [],
    [experience]
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());

    try {
      const response = await fetch("/api/foyer/candidate-applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          companySlug: companySlug || null,
          entryCode: entryCode || null,
          interviewSlotId: slotId || null,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          captchaToken,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Your application could not be submitted.");
      setSubmission(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Your application could not be submitted.");
      window.turnstile?.reset(turnstileWidgetId.current ?? undefined);
      setCaptchaToken(null);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="foyer-page foyer-page--light">
      <FoyerHeader />
      <section className={styles.foyerDetail}>
        {loading ? <p>Preparing your candidate path…</p> : null}
        {error && !experience ? (
          <section className="foyer-product__placeholder"><strong>We could not open this path.</strong><p>{error}</p></section>
        ) : null}

        {experience && !submission ? (
          <>
            <header className={styles.foyerHero}>
              <div>
                <p className={styles.eyebrow}>{sourceLabel(experience.entry.source_type)}</p>
                <h1>{experience.company ? `Take the next step with ${experience.company.name}.` : "Find your next team with Insight."}</h1>
                <p>Introduce yourself now. Insight will connect the journey to your profile when you sign in or create an account.</p>
              </div>
              <div className={styles.foyerPathBadge}>
                <span>Your path</span>
                <strong>{experience.entry.label || sourceLabel(experience.entry.source_type)}</strong>
              </div>
            </header>

            {!experience.company ? (
              <section className={styles.companyChooser}>
                <div className={styles.companyChooserHeader}>
                  <div>
                    <p className={styles.eyebrow}>Teams already using Insight</p>
                    <h2>Choose a company to see the real path</h2>
                    <p>Company selection reveals its terminal hub, primary work area, interview availability, and complete readiness expectations.</p>
                  </div>
                </div>
                <div className={styles.companyCards}>
                  {candidateCompanies.map((company) => (
                    <Link className={styles.companyCard} href={`/teams/future/${company.company_slug}`} key={company.company_id}>
                      <div className={styles.companyMark}><Building2 size={22} aria-hidden /></div>
                      <div>
                        <span>{company.industry_label || "Local delivery operation"}</span>
                        <h3>{company.company_name}</h3>
                        <p>{company.headline || company.summary || "Open the company path to learn where the team works and what readiness requires."}</p>
                        <small><MapPin size={12} /> {company.primary_work_area || company.terminal_name || "Work area shared in company profile"}</small>
                      </div>
                      <ArrowRight size={18} aria-hidden />
                    </Link>
                  ))}
                  {!candidateCompanies.length ? <div className={styles.companyChooserEmpty}><Building2 size={22} aria-hidden /><div><strong>No company profiles are published yet</strong><p>You can still introduce yourself below. Companies appear here after their hiring team publishes a Company Bio or open candidate path.</p></div></div> : null}
                </div>
                <p className={styles.continueOpen}>Not ready to choose? Continue below and introduce yourself to Insight.</p>
              </section>
            ) : null}

            {experience.company && experience.bio ? (
              <section className={styles.companyBio}>
                <div className={styles.companyBioIntro}>
                  <p className={styles.eyebrow}>About the operation</p>
                  <h2>{experience.bio.headline || `Work with ${experience.company.name}`}</h2>
                  <p>{experience.bio.summary || "The company has shared practical context to help you understand the opportunity."}</p>
                </div>
                <div className={styles.companyBioFacts}>
                  <div><span>Terminal hub</span><strong>{experience.bio.terminal_name || "Shared during the interview"}</strong><small>{experience.bio.terminal_address}</small></div>
                  <div><span>Primary work area</span><strong>{experience.bio.primary_work_area || "Local service territory"}</strong><small>{experience.bio.work_description}</small></div>
                  {experience.bio.candidate_note ? <div><span>Good to know</span><strong>{experience.bio.candidate_note}</strong></div> : null}
                </div>
              </section>
            ) : null}

            <div className={styles.foyerGrid}>
              <form className={`${styles.foyerForm} ${styles.formStack}`} onSubmit={submit}>
                <section className={styles.formSection}>
                  <div>
                    <p className={styles.eyebrow}>About you</p>
                    <h2 className={styles.formLead}>Tell the team who you are</h2>
                  </div>
                  <div className={styles.formGridTwo}>
                    <label className={styles.field}><span className={styles.fieldLabel}>First name</span><input className={styles.control} name="firstName" autoComplete="given-name" required /></label>
                    <label className={styles.field}><span className={styles.fieldLabel}>Last name</span><input className={styles.control} name="lastName" autoComplete="family-name" required /></label>
                    <label className={styles.field}><span className={styles.fieldLabel}>Email</span><input className={styles.control} name="email" type="email" autoComplete="email" required /></label>
                    <label className={styles.field}><span className={styles.fieldLabel}>Phone</span><input className={styles.control} name="phone" type="tel" autoComplete="tel" /></label>
                    <label className={styles.field}><span className={styles.fieldLabel}>Role of interest</span><select className={styles.control} name="roleInterest" defaultValue={experience.entry.role_key || "Driver"} required>{experience.entry.role_key && !experience.options.roles.some((option) => option.value === experience.entry.role_key) ? <option value={experience.entry.role_key}>{experience.entry.role_key}</option> : null}{experience.options.roles.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                    <label className={styles.field}><span className={styles.fieldLabel}>Preferred location</span><select className={styles.control} name="locationInterest" defaultValue={experience.entry.location_key || ""}><option value="">Open to available locations</option>{experience.entry.location_key && !experience.options.locations.some((option) => option.value === experience.entry.location_key) ? <option value={experience.entry.location_key}>{experience.entry.location_key}</option> : null}{experience.options.locations.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                  </div>
                  <label className={styles.field}><span className={styles.fieldLabel}>Work history or résumé summary</span><textarea className={styles.textarea} name="workHistory" rows={5} required /><span className={styles.fieldHint}>A short summary is enough for this introduction.</span></label>
                </section>
                {experience.entry.assignment_key ? <input type="hidden" name="assignmentKey" value={experience.entry.assignment_key} /> : null}

                {experience.entry.scheduling_policy !== "bypassed" ? (
                  <section className={styles.interviewPanel}>
                    <div>
                      <p className={styles.eyebrow}>Interview call</p>
                      <h3>Choose a time to talk</h3>
                      <p>{experience.interview_slots.length ? "Select an available time. The team will see it in its interview agenda." : "No time is published yet. Submit now and the team will follow up to schedule."}</p>
                    </div>
                    {experience.interview_slots.slice(0, showAllSlots ? undefined : 6).map((slot) => (
                      <label key={slot.id} className={slotId === slot.id ? styles.slotChoiceActive : styles.slotChoice}>
                        <input type="radio" name="interviewSlot" checked={slotId === slot.id} onChange={() => setSlotId(slot.id)} />
                        <span><strong>{displayDate(slot.starts_at, slot.timezone)}</strong><br /><small>{slot.timezone} · {slot.meeting_provider.replaceAll("_", " ")}</small></span>
                      </label>
                    ))}
                    {experience.interview_slots.length > 6 ? <button className="button" type="button" onClick={() => setShowAllSlots((value) => !value)}>{showAllSlots ? "Show fewer times" : `Show ${experience.interview_slots.length - 6} more times`}</button> : null}
                  </section>
                ) : (
                  <section className={styles.interviewPanel}>
                    <span>Interview already handled</span>
                    <h3>Your company contact has already set the next step.</h3>
                    <p>{experience.entry.bypass_reason}</p>
                  </section>
                )}

                <label className={styles.checkbox}>
                  <input name="consent" type="checkbox" required />
                  <span>I agree that Insight may share this candidate submission with the targeted company and use it to coordinate hiring steps.</span>
                </label>
                {turnstileSiteKey ? <div ref={turnstileRef} className="signin-bridge__captcha" aria-label="Security verification" /> : null}
                {error ? <p className={styles.feedbackError}>{error}</p> : null}
                <div className={styles.formActions}><button className={`button button-primary ${styles.primaryAction}`} type="submit" disabled={submitting || (!!turnstileSiteKey && !captchaToken)}>{submitting ? "Submitting…" : "Submit and continue"}</button></div>
              </form>

              <aside className={styles.fyiCard}>
                <div className={styles.fyiHeader}>
                  <p className={styles.eyebrow}>Good to know</p>
                  <h2>What readiness looks like</h2>
                  <p>{experience.company?.industry_label ? `${experience.company.industry_label} standards plus the company’s requirements are shared early.` : "You will see expectations before they become next-step blockers."}</p>
                </div>
                <div className={styles.fyiBody}>
                  {experience.requirements.slice(0, showAllRequirements ? undefined : 5).map((item) => <div className={styles.expectation} key={item.requirement_key}><span className={styles.expectationMeta}>{item.source_scope === "company" ? "Company add-on" : `${item.source_scope} standard`} · {item.phase.replaceAll("_", " ")}</span><strong>{item.label}</strong><p>{item.description || "The team will provide details when this step begins."}</p></div>)}
                  {!experience.requirements.length ? <div className={styles.expectation}><span className={styles.expectationMeta}>Candidate path</span><strong>Requirements will appear here</strong><p>The company has not published additional readiness expectations yet.</p></div> : null}
                </div>
                <div className={styles.fyiFooter}><span>{experience.requirements.length} expectation{experience.requirements.length === 1 ? "" : "s"} · {required.length} required</span>{experience.requirements.length > 5 ? <button type="button" onClick={() => setShowAllRequirements((value) => !value)}>{showAllRequirements ? "Show less" : "See all"}</button> : null}</div>
              </aside>
            </div>
          </>
        ) : null}

        {submission ? (
          <section className="foyer-product__placeholder">
            <span>Submission received</span>
            <strong>Your candidate path is ready.</strong>
            <p>{submission.scheduling_policy === "bypassed" ? "Continue with the next step provided by your company contact." : submission.application_status === "interview_scheduled" ? "Your interview time is reserved in the team agenda." : "The team can now review your introduction and coordinate an interview time."}</p>
            <p>{submission.profile_linked ? "This submission is already connected to your Insight profile." : "Create or sign in to your Insight profile with the same email to keep this path connected."}</p>
            <div className="cta-row">
              <Link className="button button-primary" href={submission.claim_token ? `/profile?application=${submission.application_id}&claim=${submission.claim_token}` : "/profile"}>Open my profile</Link>
              <Link className="button button-secondary" href="/teams">Back to Teams</Link>
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}
