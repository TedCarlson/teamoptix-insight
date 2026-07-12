"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { DriverMobileShell } from "@/features/driver/shell/DriverMobileShell";

type DriverMessage = {
  id: string;
  title: string;
  body: string;
  visibility: "all" | "drivers" | "leadership" | string;
  requires_ack: boolean;
  published_at: string | null;
  acknowledged_at?: string | null;
  acknowledged?: boolean;
};

function formatMessageDate(value?: string | null) {
  if (!value) return "Not recorded";

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function DriverMessagesPage() {
  const params = useParams();
  const slug = String(params?.slug ?? "");

  const [messages, setMessages] = useState<DriverMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [ackSavingId, setAckSavingId] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  const loadMessages = useCallback(async () => {
    if (!slug) return;

    try {
      setLoading(true);
      setPageError(null);

      const res = await fetch(`/api/company/${slug}/messages?history=1`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMessages([]);
        setPageError(data?.error ?? "Could not load messages.");
        return;
      }

      setMessages(Array.isArray(data.messages) ? data.messages : []);
    } catch {
      setMessages([]);
      setPageError("Could not load messages.");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

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

      await loadMessages();
    } catch {
      setPageError("Could not acknowledge message.");
    } finally {
      setAckSavingId(null);
    }
  }

  return (
    <DriverMobileShell slug={slug}>
      <section className="company-user-home">
        <section className="app-card company-user-card">
          <div className="company-user-section-header">
            <div>
              <p className="value-card__eyebrow">Messages</p>
              <h1>Company message history</h1>
            </div>
          </div>
          <p className="company-user-muted">
            Review broadcasts, reminders, and targeted messages sent to you.
          </p>
        </section>

        {pageError ? (
          <section className="app-card company-user-card">
            <p style={{ color: "#c62828", margin: 0 }}>{pageError}</p>
          </section>
        ) : null}

        <section className="app-card company-user-card">
          <div className="company-user-section-header">
            <div>
              <p className="value-card__eyebrow">Inbox</p>
              <h2>
                {loading
                  ? "Loading messages"
                  : messages.length === 1
                    ? "1 message"
                    : `${messages.length} messages`}
              </h2>
            </div>
          </div>

          {loading ? (
            <p className="company-user-muted">Loading message history…</p>
          ) : messages.length === 0 ? (
            <p className="company-user-muted">No company messages yet.</p>
          ) : (
            <div className="company-user-message-list">
              {messages.map((message) => (
                <article className="company-user-message-card" key={message.id}>
                  <div>
                    <div className="company-user-message-card__meta">
                      <span>
                        {message.visibility === "drivers"
                          ? "Driver message"
                          : "Company message"}
                      </span>
                      <span>
                        Published {formatMessageDate(message.published_at)}
                      </span>
                    </div>

                    <h3>{message.title}</h3>
                    <p>{message.body}</p>

                    {message.requires_ack ? (
                      <p className="company-user-message-card__status">
                        {message.acknowledged
                          ? `Acknowledged ${formatMessageDate(message.acknowledged_at)}`
                          : "Acknowledgement required"}
                      </p>
                    ) : null}
                  </div>

                  {message.requires_ack && !message.acknowledged ? (
                    <button
                      type="button"
                      className="button button-primary"
                      disabled={ackSavingId === message.id}
                      onClick={() => void acknowledgeMessage(message.id)}
                    >
                      {ackSavingId === message.id
                        ? "Acknowledging..."
                        : "Read & acknowledge"}
                    </button>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </DriverMobileShell>
  );
}
