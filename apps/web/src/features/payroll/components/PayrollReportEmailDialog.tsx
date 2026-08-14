"use client";

import { useEffect, useState } from "react";
import type { PayrollSummaryRow } from "@/features/payroll/lib/payroll.types";
import { money } from "@/features/payroll/lib/payroll.format";

type LeadershipRecipient = {
  role_key: "authorized_operator" | "business_contact";
  role_label: string;
  full_name: string;
  email: string;
};

const DEFAULT_PAYROLL_NOTES = "Payroll Notes:\n";

export default function PayrollReportEmailDialog({
  open,
  slug,
  weekEnd,
  summary,
  groupedSummaryRows,
  aliasCount,
  onClose,
}: {
  open: boolean;
  slug: string;
  weekEnd: string;
  summary: PayrollSummaryRow[];
  groupedSummaryRows: { group: string; rows: PayrollSummaryRow[] }[];
  aliasCount: number;
  onClose: () => void;
}) {
  const [recipientsText, setRecipientsText] = useState("");
  const [leadershipRecipients, setLeadershipRecipients] = useState<
    LeadershipRecipient[]
  >([]);
  const [selectedLeadershipEmails, setSelectedLeadershipEmails] = useState<
    string[]
  >([]);
  const [leadershipLoading, setLeadershipLoading] = useState(false);
  const [reportMemo, setReportMemo] = useState(DEFAULT_PAYROLL_NOTES);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !slug) return;

    let active = true;

    async function loadLeadershipRecipients() {
      setLeadershipLoading(true);

      try {
        const response = await fetch(`/api/company/${slug}/config/leadership`, {
          credentials: "include",
          cache: "no-store",
        });
        const payload = await response.json().catch(() => ({}));

        if (!active) return;
        if (!response.ok) {
          setLeadershipRecipients([]);
          return;
        }

        const recipients: LeadershipRecipient[] = (
          Array.isArray(payload?.roles) ? payload.roles : []
        )
          .filter(
            (role: { role_key?: unknown; email?: unknown }) =>
              (role.role_key === "authorized_operator" ||
                role.role_key === "business_contact") &&
              typeof role.email === "string" &&
              role.email.trim().length > 0
          )
          .map(
            (role: {
              role_key: "authorized_operator" | "business_contact";
              role_label?: string;
              full_name?: string;
              email: string;
            }): LeadershipRecipient => ({
              role_key: role.role_key,
              role_label:
                role.role_label ||
                (role.role_key === "authorized_operator"
                  ? "Authorized Operator"
                  : "Business Contact"),
              full_name: role.full_name || role.email,
              email: role.email.trim(),
            })
          );

        setLeadershipRecipients(recipients);
        setSelectedLeadershipEmails((current) =>
          current.filter((email) =>
            recipients.some((recipient) => recipient.email === email)
          )
        );
      } catch {
        if (active) setLeadershipRecipients([]);
      } finally {
        if (active) setLeadershipLoading(false);
      }
    }

    void loadLeadershipRecipients();

    return () => {
      active = false;
    };
  }, [open, slug]);

  if (!open) return null;

  const estimatedTotal = summary.reduce((sum, row) => sum + Number(row.estimated_total ?? 0), 0);

  async function sendReport() {
    if (aliasCount > 0) {
      setMessage(null);
      setError(
        `Resolve ${aliasCount} alias review item${aliasCount === 1 ? "" : "s"} before sending payroll.`
      );
      return;
    }

    setSending(true);
    setMessage(null);
    setError(null);

    try {
      const recipients = recipientsText
        .split(/[,\n;]/)
        .map((value) => value.trim())
        .filter(Boolean);

      recipients.push(...selectedLeadershipEmails);

      const res = await fetch(`/api/company/${slug}/payroll/report-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          weekEnd,
          recipients,
          memo: reportMemo.trim(),
          summary,
          groupedSummaryRows,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error ?? "Failed to send payroll report.");
        return;
      }

      setMessage(`Sent to ${Array.isArray(data?.recipients) ? data.recipients.join(", ") : "recipients"}.`);
    } catch {
      setError("Failed to send payroll report.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1100,
        background: "rgba(15,23,42,.42)",
        display: "grid",
        placeItems: "center",
        padding: 24,
      }}
    >
      <aside
        className="payroll-dialog-surface payroll-report-email-dialog"
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
        style={{
          width: "min(560px, 96vw)",
          background: "#fff",
          borderRadius: 18,
          border: "1px solid #dbe6f3",
          boxShadow: "0 24px 80px rgba(15,23,42,.28)",
          padding: 18,
          display: "grid",
          gap: 14,
        }}
      >
        <header>
          <p className="workspace-eyebrow">Send payroll report</p>
          <h2 style={{ margin: 0 }}>Payroll Summary</h2>
          <p className="workspace-card-body" style={{ marginTop: 4 }}>
            Week ending {weekEnd} · {summary.length} rows · Estimated payroll {money(estimatedTotal)}
          </p>
        </header>

        <label style={{ display: "grid", gap: 6 }}>
          <span className="hero-stat__label">Additional recipients</span>
          <textarea
            value={recipientsText}
            onChange={(event) => setRecipientsText(event.target.value)}
            placeholder="email@example.com, another@example.com"
            style={{
              minHeight: 90,
              borderRadius: 12,
              border: "1px solid #d6dfeb",
              padding: 12,
              font: "inherit",
            }}
          />
        </label>

        <div style={{ display: "grid", gap: 7 }}>
          <span className="hero-stat__label">Company leadership recipients</span>
          {leadershipLoading ? (
            <span style={{ color: "#64748b", fontSize: 12 }}>
              Loading AO and Business Contact…
            </span>
          ) : leadershipRecipients.length === 0 ? (
            <span style={{ color: "#92400e", fontSize: 12, fontWeight: 750 }}>
              No AO or Business Contact email is configured.
            </span>
          ) : (
            <div style={{ display: "grid", gap: 7 }}>
              {leadershipRecipients.map((recipient) => (
                <label
                  key={`${recipient.role_key}:${recipient.email}`}
                  style={{
                    display: "flex",
                    gap: 9,
                    alignItems: "flex-start",
                    border: "1px solid #dbe6f3",
                    borderRadius: 11,
                    padding: "9px 10px",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedLeadershipEmails.includes(recipient.email)}
                    onChange={(event) => {
                      setSelectedLeadershipEmails((current) =>
                        event.target.checked
                          ? Array.from(new Set([...current, recipient.email]))
                          : current.filter((email) => email !== recipient.email)
                      );
                    }}
                  />
                  <span style={{ display: "grid", gap: 2 }}>
                    <strong style={{ fontSize: 13 }}>{recipient.full_name}</strong>
                    <small style={{ color: "#64748b" }}>
                      {recipient.role_label} · {recipient.email}
                    </small>
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        <label style={{ display: "grid", gap: 6 }}>
          <span className="hero-stat__label">Email body memo</span>
          <textarea
            value={reportMemo}
            onChange={(event) => setReportMemo(event.target.value)}
            maxLength={4000}
            style={{
              minHeight: 120,
              borderRadius: 12,
              border: "1px solid #d6dfeb",
              padding: 12,
              font: "inherit",
              resize: "vertical",
            }}
          />
        </label>

        <p style={{ margin: 0, color: "#64748b", fontSize: 12 }}>
          The signed-in user is automatically included. Selected leadership
          contacts and additional recipients are added to the same report.
        </p>

        {aliasCount > 0 ? (
          <p style={{ margin: 0, color: "#991b1b", fontWeight: 850 }}>
            Resolve {aliasCount} alias review item{aliasCount === 1 ? "" : "s"} before sending payroll.
          </p>
        ) : null}

        {message ? <p style={{ margin: 0, color: "#166534", fontWeight: 800 }}>{message}</p> : null}
        {error ? <p style={{ margin: 0, color: "#991b1b", fontWeight: 800 }}>{error}</p> : null}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button type="button" className="button" onClick={onClose} disabled={sending}>
            Close
          </button>
          <button type="button" className="button button-primary" onClick={sendReport} disabled={sending || !summary.length || aliasCount > 0}>
            {sending ? "Sending..." : "Send report"}
          </button>
        </div>
      </aside>
    </div>
  );
}
