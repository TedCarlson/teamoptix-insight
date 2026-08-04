"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import QRCode from "qrcode";
import { Building2, Copy, Download, ExternalLink, QrCode, Send, UserRoundPlus, UsersRound } from "lucide-react";
import styles from "../hiring-workspace.module.css";

type EntryLink = {
  id: string;
  entry_code: string;
  link_type: "company_general" | "company_invite" | "member_referral";
  label: string;
  scheduling_policy: "required" | "offered" | "bypassed";
  status: string;
  use_count: number;
  max_uses?: number | null;
  expires_at?: string | null;
};

type TargetOption = { value: string; label: string };
type TargetOptions = { roles: TargetOption[]; locations: TargetOption[]; assignments: TargetOption[] };

const pathChoices = [
  {
    value: "company_general" as const,
    title: "Open company path",
    copy: "A reusable link and QR code for job posts, counters, or community sharing.",
    icon: Building2,
  },
  {
    value: "company_invite" as const,
    title: "Invite one candidate",
    copy: "A private, single-use path prepared for a person the company already knows.",
    icon: UserRoundPlus,
  },
  {
    value: "member_referral" as const,
    title: "Team member referral",
    copy: "A trackable path that keeps the referring team member associated.",
    icon: UsersRound,
  },
];

function pathFor(slug: string, link: EntryLink) {
  if (link.link_type === "company_general") return `/teams/future/${slug}`;
  if (link.link_type === "member_referral") return `/teams/future/referral/${link.entry_code}`;
  return `/teams/future/invite/${link.entry_code}`;
}

function typeLabel(type: EntryLink["link_type"]) {
  if (type === "company_general") return "Open company path";
  if (type === "member_referral") return "Team member referral";
  return "Private company invitation";
}

export default function HiringInvitationsPage() {
  const slug = String(useParams()?.slug ?? "");
  const [links, setLinks] = useState<EntryLink[]>([]);
  const [qrCodes, setQrCodes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [linkType, setLinkType] = useState<EntryLink["link_type"]>("company_invite");
  const [scheduling, setScheduling] = useState<EntryLink["scheduling_policy"]>("required");
  const [latestId, setLatestId] = useState<string | null>(null);
  const [targetOptions, setTargetOptions] = useState<TargetOptions>({ roles: [], locations: [], assignments: [] });

  const load = useCallback(async () => {
    const response = await fetch(`/api/company/${slug}/people/invitations`, {
      cache: "no-store",
      credentials: "include",
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Unable to load candidate paths.");
    const nextLinks = (body.links || []) as EntryLink[];
    setLinks(nextLinks);
    setTargetOptions(body.options ?? { roles: [], locations: [], assignments: [] });
    return nextLinks;
  }, [slug]);

  useEffect(() => {
    if (slug) void load().catch((reason) => setError(reason.message));
  }, [load, slug]);

  useEffect(() => {
    if (!links.length) return;
    let active = true;
    void Promise.all(
      links.map(async (link) => {
        const url = `${window.location.origin}${pathFor(slug, link)}`;
        const dataUrl = await QRCode.toDataURL(url, {
          width: 320,
          margin: 2,
          color: { dark: "#0f172a", light: "#ffffff" },
          errorCorrectionLevel: "M",
        });
        return [link.id, dataUrl] as const;
      }),
    ).then((entries) => {
      if (active) setQrCodes(Object.fromEntries(entries));
    }).catch(() => {
      if (active) setError("The share links are ready, but QR previews could not be prepared.");
    });
    return () => { active = false; };
  }, [links, slug]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const fields = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      const response = await fetch(`/api/company/${slug}/people/invitations`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...fields, linkType, schedulingPolicy: scheduling }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to create this candidate path.");
      setLatestId(body.id ?? null);
      await load();
      setMessage("Share kit prepared. Copy the link or download its QR code.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to create this candidate path.");
    } finally {
      setBusy(false);
    }
  }

  async function copy(link: EntryLink) {
    await navigator.clipboard.writeText(`${window.location.origin}${pathFor(slug, link)}`);
    setMessage(`${link.label} link copied.`);
  }

  async function share(link: EntryLink) {
    const url = `${window.location.origin}${pathFor(slug, link)}`;
    if (navigator.share) {
      await navigator.share({ title: link.label, text: "Begin your candidate journey with Insight.", url });
    } else {
      await navigator.clipboard.writeText(url);
      setMessage(`${link.label} link copied.`);
    }
  }

  const activeLinks = useMemo(() => links.filter((link) => link.status === "active"), [links]);
  const latest = links.find((link) => link.id === latestId) ?? null;

  return (
    <main className="workspace-shell">
      <section className={`workspace-main ${styles.stack}`}>
        <header className={`workspace-header ${styles.pageHeader}`}>
          <div className="workspace-header__copy">
            <p className={styles.eyebrow}>People · Hiring</p>
            <h1 className="workspace-title">Candidate Invitations</h1>
            <p className="workspace-subtitle">
              Prepare a candidate path, then distribute it as a private link or scannable QR card.
            </p>
          </div>
          <div className={styles.summaryStrip}>
            <div className={styles.summaryItem}><span>Active paths</span><strong>{activeLinks.length}</strong></div>
            <div className={styles.summaryItem}><span>Entries</span><strong>{links.reduce((sum, link) => sum + link.use_count, 0)}</strong></div>
            <div className={styles.summaryItem}><span>Share format</span><strong>Link + QR</strong></div>
          </div>
        </header>

        {error ? <p className={styles.feedbackError}>{error}</p> : null}
        {message ? <p className={styles.feedback}>{message}</p> : null}

        {latest ? (
          <section className={styles.readyKit}>
            <div>
              <p className={styles.eyebrow}>Ready to distribute</p>
              <h2>{latest.label}</h2>
              <p>The invitation is active. Use the QR card in print or share the private link directly.</p>
              <div className={styles.kitActions}>
                <button className="button button-primary" type="button" onClick={() => void copy(latest)}><Copy size={16} /> Copy link</button>
                {qrCodes[latest.id] ? <a className="button" href={qrCodes[latest.id]} download={`${latest.label.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-qr.png`}><Download size={16} /> Download QR</a> : null}
                <Link className="button" href={pathFor(slug, latest)} target="_blank"><ExternalLink size={16} /> Preview</Link>
              </div>
            </div>
            <div className={styles.qrFrame}>
              {qrCodes[latest.id] ? <Image unoptimized width={136} height={136} src={qrCodes[latest.id]} alt={`QR code for ${latest.label}`} /> : <QrCode size={72} aria-label="Preparing QR code" />}
            </div>
          </section>
        ) : null}

        <section className={styles.surface}>
          <div className={styles.surfaceHeader}>
            <div>
              <p className={styles.eyebrow}>Prepare a path</p>
              <h2>Who is this for?</h2>
              <p>Choose the simplest path that preserves the association you need.</p>
            </div>
          </div>
          <div className={styles.surfaceBody}>
            <form className={styles.formStack} onSubmit={create}>
              <div className={styles.choiceGrid}>
                {pathChoices.map((choice) => {
                  const Icon = choice.icon;
                  return (
                    <button
                      key={choice.value}
                      type="button"
                      className={linkType === choice.value ? styles.choiceActive : styles.choice}
                      onClick={() => {
                        setLinkType(choice.value);
                        if (choice.value !== "company_invite" && scheduling === "bypassed") setScheduling("required");
                      }}
                    >
                      <Icon size={18} aria-hidden />
                      <strong>{choice.title}</strong>
                      <span>{choice.copy}</span>
                    </button>
                  );
                })}
              </div>

              <section className={styles.formSection}>
                <h3 className={styles.formSectionTitle}>Name the share kit</h3>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Label</span>
                  <input className={styles.control} name="label" required placeholder={linkType === "company_general" ? "Join our team" : "Delivery driver candidate"} />
                  <span className={styles.fieldHint}>Use a name HR will recognize later. Candidates can see this context.</span>
                </label>
              </section>

              <section className={styles.formSection}>
                <h3 className={styles.formSectionTitle}>What happens after they introduce themselves?</h3>
                <div className={styles.choiceGrid}>
                  <button type="button" className={scheduling === "required" ? styles.choiceActive : styles.choice} onClick={() => setScheduling("required")}><strong>Reserve an interview</strong><span>Show published times and make scheduling part of the path.</span></button>
                  <button type="button" className={scheduling === "offered" ? styles.choiceActive : styles.choice} onClick={() => setScheduling("offered")}><strong>Offer interview times</strong><span>Let candidates submit even when they do not choose a time.</span></button>
                  {linkType === "company_invite" ? <button type="button" className={scheduling === "bypassed" ? styles.choiceActive : styles.choice} onClick={() => setScheduling("bypassed")}><strong>Next step already set</strong><span>Skip scheduling because the company already spoke with the candidate.</span></button> : null}
                </div>
                {scheduling === "bypassed" ? (
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>Prior conversation and next step</span>
                    <textarea className={styles.textarea} name="bypassReason" required placeholder="The candidate already spoke with… Their next step is…" />
                  </label>
                ) : null}
              </section>

              <details>
                <summary className={styles.formSectionTitle}>Optional targeting and limits</summary>
                <div className={styles.formGrid} style={{ marginTop: 12 }}>
                  <label className={styles.field}><span className={styles.fieldLabel}>Role</span><select className={styles.control} name="roleKey" defaultValue=""><option value="">Any role</option>{targetOptions.roles.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                  <label className={styles.field}><span className={styles.fieldLabel}>Location</span><select className={styles.control} name="locationKey" defaultValue=""><option value="">Any location</option>{targetOptions.locations.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                  <label className={styles.field}><span className={styles.fieldLabel}>Assignment</span><select className={styles.control} name="assignmentKey" defaultValue=""><option value="">Any assignment</option>{targetOptions.assignments.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                  {linkType !== "company_general" ? <label className={styles.field}><span className={styles.fieldLabel}>Maximum entries</span><input className={styles.control} name="maxUses" type="number" min="1" defaultValue={linkType === "company_invite" ? 1 : undefined} /></label> : null}
                  {linkType !== "company_general" ? <label className={styles.field}><span className={styles.fieldLabel}>Expires</span><input className={styles.control} name="expiresAt" type="datetime-local" /></label> : null}
                </div>
              </details>

              <div className={styles.formActions}>
                <button className={`button button-primary ${styles.primaryAction}`} disabled={busy} type="submit">
                  <QrCode size={16} /> {busy ? "Preparing…" : "Prepare link and QR"}
                </button>
              </div>
            </form>
          </div>
        </section>

        <section className={styles.surface}>
          <div className={styles.surfaceHeader}>
            <div><p className={styles.eyebrow}>Share library</p><h2>Prepared candidate paths</h2><p>Everything HR needs to distribute or revisit a path.</p></div>
          </div>
          <div className={styles.surfaceBody}>
            {activeLinks.length ? (
              <div className={styles.shareLibrary}>
                {activeLinks.map((link) => (
                  <article className={styles.shareCard} key={link.id}>
                    <div className={styles.qrThumb}>
                      {qrCodes[link.id] ? <Image unoptimized width={72} height={72} src={qrCodes[link.id]} alt={`QR code for ${link.label}`} /> : <QrCode size={38} />}
                    </div>
                    <div className={styles.shareCardCopy}>
                      <span className={styles.badgeBlue}>{typeLabel(link.link_type)}</span>
                      <h3>{link.label}</h3>
                      <p>Interview {link.scheduling_policy.replaceAll("_", " ")} · {link.use_count}{link.max_uses ? ` of ${link.max_uses}` : ""} entries</p>
                      <small>{pathFor(slug, link)}</small>
                    </div>
                    <div className={styles.shareActions}>
                      <button className="button" type="button" onClick={() => void copy(link)}><Copy size={15} /> Copy</button>
                      <button className="button" type="button" onClick={() => void share(link)}><Send size={15} /> Share</button>
                      {qrCodes[link.id] ? <a className="button" href={qrCodes[link.id]} download={`${link.label.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-qr.png`}><Download size={15} /> QR</a> : null}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className={styles.emptyState}><strong>No share kits prepared</strong><p>Prepare the company path first, then use its link or QR wherever candidates discover the team.</p></div>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
