"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

type CompanyMessage = {
  id: string;
  title: string;
  body: string;
  status: "draft" | "published" | "archived";
  visibility: "all" | "drivers" | "leadership";
  requires_ack: boolean;
  published_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

type MessageFormState = {
  title: string;
  body: string;
  visibility: "all" | "drivers" | "leadership";
  audience_mode: "all_drivers" | "selected_drivers";
  recipient_roster_member_ids: string[];
  requires_ack: boolean;
};

type DriverRecipient = {
  roster_member_id: string;
  full_name: string;
  employment_status: string | null;
  job_title: string | null;
};

const emptyForm: MessageFormState = {
  title: "",
  body: "",
  visibility: "drivers",
  audience_mode: "all_drivers",
  recipient_roster_member_ids: [],
  requires_ack: true,
};

function formatMessageDate(value: string | null) {
  if (!value) return "Not published";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function CompanyAnnouncementsPage() {
  const params = useParams();
  const slugParam = params?.slug;
  const slug = Array.isArray(slugParam) ? slugParam[0] : slugParam ?? "";

  const [messages, setMessages] = useState<CompanyMessage[]>([]);
  const [driverRecipients, setDriverRecipients] = useState<DriverRecipient[]>([]);
  const [canAdmin, setCanAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [form, setForm] = useState<MessageFormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const selectedDriverCount = form.recipient_roster_member_ids.length;

  const selectedDrivers = useMemo(() => {
    const selected = new Set(form.recipient_roster_member_ids);

    return driverRecipients.filter((driver) =>
      selected.has(driver.roster_member_id)
    );
  }, [driverRecipients, form.recipient_roster_member_ids]);

  const messageCountLabel = useMemo(() => {
    if (loading) return "Loading messages";
    if (messages.length === 1) return "1 message";
    return `${messages.length} messages`;
  }, [loading, messages.length]);

  const loadMessages = useCallback(async () => {
    if (!slug) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/company/${encodeURIComponent(slug)}/messages?admin=1`,
        { cache: "no-store" }
      );
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          typeof payload.error === "string"
            ? payload.error
            : "Failed to load messages."
        );
      }

      setMessages(Array.isArray(payload.messages) ? payload.messages : []);
      setCanAdmin(Boolean(payload.can_admin));
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load messages."
      );
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    if (!slug || !canAdmin) return;

    async function loadRoster() {
      const response = await fetch(
        `/api/company/${encodeURIComponent(slug)}/people/roster`,
        { cache: "no-store" }
      );
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) return;

      const roster = Array.isArray(payload.roster) ? payload.roster : [];

      setDriverRecipients(
        roster
          .filter((row: any) =>
            row.roster_member_id &&
            (row.employment_status === "Active" || row.employment_status === "Trainee")
          )
          .map((row: any) => ({
            roster_member_id: row.roster_member_id,
            full_name: row.full_name ?? "Unnamed driver",
            employment_status: row.employment_status ?? null,
            job_title: row.job_title ?? null,
          }))
      );
    }

    void loadRoster();
  }, [slug, canAdmin]);

  async function submitMessage(status: "draft" | "published") {
    if (!slug || saving) return;

    if (
      form.visibility === "drivers" &&
      form.audience_mode === "selected_drivers" &&
      form.recipient_roster_member_ids.length === 0
    ) {
      setError("Select at least one driver for a targeted message.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/company/${encodeURIComponent(slug)}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: form.title,
            body: form.body,
            visibility: form.visibility,
            recipient_roster_member_ids:
              form.visibility === "drivers" && form.audience_mode === "selected_drivers"
                ? form.recipient_roster_member_ids
                : [],
            requires_ack: form.requires_ack,
            status,
          }),
        }
      );

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          typeof payload.error === "string"
            ? payload.error
            : "Failed to save message."
        );
      }

      setForm(emptyForm);
      setOverlayOpen(false);
      await loadMessages();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to save message."
      );
    } finally {
      setSaving(false);
    }
  }

  function handleDraftSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitMessage("draft");
  }

  function abandonDraft() {
    setForm(emptyForm);
    setError(null);
    setOverlayOpen(false);
  }

  return (
    <main className="workspace-shell">
      <section className="workspace-main" style={{ paddingTop: 0, paddingBottom: 24 }}>
        <section className="app-card" style={{ padding: 16, marginBottom: 10 }}>
          <p className="value-card__eyebrow">Company announcements</p>
          <h1 className="workspace-title">Message board</h1>
          <p className="app-card__body" style={{ marginTop: 6 }}>
            A company-wide communication surface for operational updates, reminders, and general notices.
          </p>
        </section>

        {error ? (
          <section className="app-card company-message-alert">
            {error}
          </section>
        ) : null}

        <section className="company-announcements-layout">
          <section className="app-card company-announcements-feed">
            <div className="company-message-feed-header">
              <div>
                <p className="value-card__eyebrow">Feed</p>
                <h2 className="app-card__title">{messageCountLabel}</h2>
              </div>
            </div>

            {loading ? (
              <p className="app-card__body" style={{ marginTop: 10 }}>
                Loading company messages…
              </p>
            ) : messages.length === 0 ? (
              <>
                <h2 className="app-card__title">No announcements yet</h2>
                <p className="app-card__body" style={{ marginTop: 4 }}>
                  Announcements will appear here once leaders publish messages.
                </p>
              </>
            ) : (
              <div className="company-message-list">
                {messages.map((message) => (
                  <article className="company-message-card" key={message.id}>
                    <div className="company-message-card__meta">
                      <span>{message.status}</span>
                      <span>{message.visibility}</span>
                      {message.requires_ack ? <span>ack required</span> : null}
                    </div>
                    <h3>{message.title}</h3>
                    <p>{message.body}</p>
                    <small>
                      {message.status === "published"
                        ? `Published ${formatMessageDate(message.published_at)}`
                        : `Updated ${formatMessageDate(message.updated_at)}`}
                    </small>
                  </article>
                ))}
              </div>
            )}
          </section>

          <aside className="app-card company-announcements-sidebar">
            <p className="value-card__eyebrow">Composer</p>
            <h2 className="app-card__title">Communication controls</h2>
            <p className="app-card__body" style={{ marginTop: 4 }}>
              Draft, publish, broadcast, or target messages to selected active drivers.
            </p>
            <div className="cta-row" style={{ marginTop: 12 }}>
              <button
                className="button"
                type="button"
                disabled={!canAdmin}
                onClick={() => setOverlayOpen(true)}
              >
                Draft message
              </button>
            </div>
          </aside>
        </section>
      </section>

      {overlayOpen ? (
        <div className="company-message-overlay" role="presentation">
          <div className="company-message-overlay__backdrop" onClick={abandonDraft} />
          <form className="company-message-overlay__panel" onSubmit={handleDraftSubmit}>
            <div className="company-message-overlay__header">
              <div>
                <p className="value-card__eyebrow">Message draft</p>
                <h2>Create company message</h2>
              </div>
              <button type="button" onClick={() => setOverlayOpen(false)}>
                Close
              </button>
            </div>

            <label>
              <span>Title</span>
              <input
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                placeholder="Example: Morning dispatch reminder"
                required
              />
            </label>

            <label>
              <span>Message</span>
              <textarea
                value={form.body}
                onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))}
                placeholder="Write the update drivers or leaders need to see."
                required
                rows={7}
              />
            </label>

            <label>
              <span>Visibility</span>
              <select
                value={form.visibility}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    visibility: event.target.value as MessageFormState["visibility"],
                    audience_mode:
                      event.target.value === "drivers"
                        ? current.audience_mode
                        : "all_drivers",
                    recipient_roster_member_ids:
                      event.target.value === "drivers"
                        ? current.recipient_roster_member_ids
                        : [],
                  }))
                }
              >
                <option value="drivers">Drivers</option>
                <option value="all">Everyone</option>
                <option value="leadership">Leadership</option>
              </select>
            </label>

            {form.visibility === "drivers" ? (
              <fieldset className="company-message-recipient-picker">
                <legend>Driver audience</legend>

                <label className="company-message-checkbox">
                  <input
                    type="radio"
                    name="audience_mode"
                    checked={form.audience_mode === "all_drivers"}
                    onChange={() =>
                      setForm((current) => ({
                        ...current,
                        audience_mode: "all_drivers",
                        recipient_roster_member_ids: [],
                      }))
                    }
                  />
                  <span>All active drivers</span>
                </label>

                <label className="company-message-checkbox">
                  <input
                    type="radio"
                    name="audience_mode"
                    checked={form.audience_mode === "selected_drivers"}
                    onChange={() =>
                      setForm((current) => ({
                        ...current,
                        audience_mode: "selected_drivers",
                      }))
                    }
                  />
                  <span>Selected drivers</span>
                </label>

                {form.audience_mode === "selected_drivers" ? (
                  <>
                    <section className="company-message-selected-recipients">
                      <div>
                        <p className="value-card__eyebrow">Recipients</p>
                        <strong>
                          {selectedDriverCount === 1
                            ? "1 driver selected"
                            : `${selectedDriverCount} drivers selected`}
                        </strong>
                      </div>

                      {selectedDrivers.length > 0 ? (
                        <details>
                          <summary>Review selected drivers</summary>
                          <div className="company-message-selected-recipients__list">
                            {selectedDrivers.map((driver) => (
                              <span key={driver.roster_member_id}>
                                {driver.full_name}
                                {driver.job_title ? ` · ${driver.job_title}` : ""}
                              </span>
                            ))}
                          </div>
                        </details>
                      ) : (
                        <p className="app-card__body">
                          Select one or more drivers below.
                        </p>
                      )}
                    </section>

                    <div className="company-message-recipient-list">
                      {driverRecipients.length === 0 ? (
                        <p className="app-card__body">
                          No active drivers are available for targeting.
                        </p>
                      ) : (
                        driverRecipients.map((driver) => (
                          <label className="company-message-checkbox" key={driver.roster_member_id}>
                            <input
                              type="checkbox"
                              checked={form.recipient_roster_member_ids.includes(driver.roster_member_id)}
                              onChange={(event) =>
                                setForm((current) => {
                                  const selected = new Set(current.recipient_roster_member_ids);

                                  if (event.target.checked) {
                                    selected.add(driver.roster_member_id);
                                  } else {
                                    selected.delete(driver.roster_member_id);
                                  }

                                  return {
                                    ...current,
                                    recipient_roster_member_ids: Array.from(selected),
                                  };
                                })
                              }
                            />
                            <span>
                              {driver.full_name}
                              {driver.job_title ? ` · ${driver.job_title}` : ""}
                            </span>
                          </label>
                        ))
                      )}
                    </div>
                  </>
                ) : null}
              </fieldset>
            ) : null}

            <label className="company-message-checkbox">
              <input
                type="checkbox"
                checked={form.requires_ack}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    requires_ack: event.target.checked,
                  }))
                }
              />
              <span>Require acknowledgement</span>
            </label>

            <div className="company-message-overlay__footer">
              <button className="button" type="button" disabled={saving} onClick={abandonDraft}>
                Abandon draft
              </button>

              <div className="company-message-overlay__footer-actions">
                <button className="button" type="submit" disabled={saving}>
                  Save draft
                </button>
                <button
                  className="button"
                  type="button"
                  disabled={saving}
                  onClick={() => void submitMessage("published")}
                >
                  Publish now
                </button>
              </div>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}
