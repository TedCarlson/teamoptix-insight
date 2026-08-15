"use client";

import { useEffect, useState } from "react";
import type { PayrollSummaryRow } from "@/features/payroll/lib/payroll.types";
import { money } from "@/features/payroll/lib/payroll.format";
import {
  isPayrollRecipientEmail,
  splitPayrollRecipientInput,
} from "@/features/payroll/lib/payrollReportRecipients";

type ReportRecipient = {
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
  const [authorizedOperator, setAuthorizedOperator] =
    useState<ReportRecipient | null>(null);
  const [businessContact, setBusinessContact] =
    useState<ReportRecipient | null>(null);
  const [includeBusinessContact, setIncludeBusinessContact] = useState(false);
  const [recipientsLoading, setRecipientsLoading] = useState(false);
  const [recipientsLoadError, setRecipientsLoadError] = useState<string | null>(null);
  const [reportMemo, setReportMemo] = useState(DEFAULT_PAYROLL_NOTES);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !slug) return;

    let active = true;

    async function loadReportRecipients() {
      setRecipientsLoading(true);
      setRecipientsLoadError(null);
      setAuthorizedOperator(null);
      setBusinessContact(null);
      setIncludeBusinessContact(false);
      setRecipientsText("");
      setReportMemo(DEFAULT_PAYROLL_NOTES);
      setMessage(null);
      setError(null);

      try {
        const [companyResponse, leadershipResponse] = await Promise.all([
          fetch(`/api/company/${slug}`, {
            credentials: "include",
            cache: "no-store",
          }),
          fetch(`/api/company/${slug}/config/leadership`, {
            credentials: "include",
            cache: "no-store",
          }),
        ]);
        const [companyPayload, leadershipPayload] = await Promise.all([
          companyResponse.json().catch(() => ({})),
          leadershipResponse.json().catch(() => ({})),
        ]);

        if (!active) return;

        if (companyResponse.ok) {
          const company = companyPayload?.company;
          const email =
            typeof company?.contact_email === "string"
              ? company.contact_email.trim()
              : "";

          if (isPayrollRecipientEmail(email)) {
            setAuthorizedOperator({
              role_label: "Authorized Operator",
              full_name:
                company?.authorized_operator_name?.trim() || "Authorized Operator",
              email,
            });
          } else {
            setRecipientsLoadError(
              email
                ? "The Authorized Operator email in Company Profile is not valid."
                : "The Authorized Operator email is missing from Company Profile."
            );
          }
        } else {
          setRecipientsLoadError(
            companyPayload?.error ??
              "Failed to load the Authorized Operator from Company Profile."
          );
        }

        if (leadershipResponse.ok) {
          const role = (
            Array.isArray(leadershipPayload?.roles)
              ? leadershipPayload.roles
              : []
          ).find(
            (item: { role_key?: unknown; email?: unknown }) =>
              item.role_key === "business_contact" &&
              typeof item.email === "string" &&
              item.email.trim().length > 0
          );

          if (role) {
            setBusinessContact({
              role_label: role.role_label || "Business Contact",
              full_name: role.full_name || role.email,
              email: role.email.trim(),
            });
          }
        }
      } catch {
        if (active) {
          setRecipientsLoadError("Failed to load company report recipients.");
        }
      } finally {
        if (active) setRecipientsLoading(false);
      }
    }

    void loadReportRecipients();

    return () => {
      active = false;
    };
  }, [open, slug]);

  if (!open) return null;

  const estimatedTotal = summary.reduce(
    (sum, row) => sum + Number(row.estimated_total ?? 0),
    0
  );

  async function sendReport() {
    if (aliasCount > 0) {
      setMessage(null);
      setError(
        `Resolve ${aliasCount} alias review item${
          aliasCount === 1 ? "" : "s"
        } before sending payroll.`
      );
      return;
    }

    setSending(true);
    setMessage(null);
    setError(null);

    try {
      const recipients = splitPayrollRecipientInput(recipientsText);
      const invalidRecipients = recipients.filter(
        (email) => !isPayrollRecipientEmail(email)
      );

      if (invalidRecipients.length) {
        setError(
          `Check the additional email address${
            invalidRecipients.length === 1 ? "" : "es"
          }: ${invalidRecipients.join(", ")}`
        );
        return;
      }

      if (includeBusinessContact && businessContact) {
        recipients.unshift(businessContact.email);
      }

      const response = await fetch(`/api/company/${slug}/payroll/report-email`, {
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

      const data = await response.json();

      if (!response.ok) {
        setError(data?.error ?? "Failed to send payroll report.");
        return;
      }

      setMessage(
        `Sent to ${
          Array.isArray(data?.recipients)
            ? data.recipients.join(", ")
            : "recipients"
        }.`
      );
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
        aria-labelledby="payroll-report-email-title"
        onMouseDown={(event) => event.stopPropagation()}
        style={{
          width: "min(560px, 96vw)",
          maxHeight: "min(760px, 92vh)",
          overflowY: "auto",
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
          <h2 id="payroll-report-email-title" style={{ margin: 0 }}>
            Payroll Summary
          </h2>
          <p className="workspace-card-body" style={{ marginTop: 4 }}>
            Week ending {weekEnd} · {summary.length} rows · Estimated payroll{" "}
            {money(estimatedTotal)}
          </p>
        </header>

        <label style={{ display: "grid", gap: 6 }}>
          <span className="hero-stat__label">Notes</span>
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

        <div style={{ display: "grid", gap: 8 }}>
          <span className="hero-stat__label">Report recipients</span>
          {recipientsLoading ? (
            <span style={{ color: "#64748b", fontSize: 12 }}>
              Loading Company Profile recipients…
            </span>
          ) : (
            <>
              {authorizedOperator ? (
                <div className="payroll-report-recipient payroll-report-recipient--automatic">
                  <span style={{ display: "grid", gap: 2 }}>
                    <strong style={{ fontSize: 13 }}>
                      {authorizedOperator.full_name}
                    </strong>
                    <small>
                      {authorizedOperator.role_label} · {authorizedOperator.email}
                    </small>
                  </span>
                  <span className="payroll-report-recipient__status">
                    Included automatically
                  </span>
                </div>
              ) : (
                <span
                  style={{ color: "#92400e", fontSize: 12, fontWeight: 750 }}
                >
                  Add the Authorized Operator email in Company Profile before
                  sending.
                </span>
              )}

              {businessContact ? (
                <fieldset className="payroll-report-bc-options">
                  <legend>
                    Business Contact <span>· optional</span>
                  </legend>
                  <label>
                    <input
                      type="radio"
                      name="business-contact-recipient"
                      checked={!includeBusinessContact}
                      onChange={() => setIncludeBusinessContact(false)}
                    />
                    <span>Do not include</span>
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="business-contact-recipient"
                      checked={includeBusinessContact}
                      onChange={() => setIncludeBusinessContact(true)}
                    />
                    <span>
                      Include <strong>{businessContact.full_name}</strong>
                      <small>{businessContact.email}</small>
                    </span>
                  </label>
                </fieldset>
              ) : (
                <small style={{ color: "#64748b" }}>
                  No Business Contact email is configured. The AO will still
                  receive the report.
                </small>
              )}
            </>
          )}
        </div>

        <p style={{ margin: 0, color: "#64748b", fontSize: 12 }}>
          The Authorized Operator email comes from Company Profile. The Business
          Contact and any additional address are included only when you add them.
        </p>

        <label className="payroll-report-fallback-field">
          <span>Need another recipient?</span>
          <input
            type="text"
            inputMode="email"
            autoComplete="off"
            value={recipientsText}
            onChange={(event) => setRecipientsText(event.target.value)}
            placeholder="Additional email address (fallback)"
          />
          <small>Fallback only · separate multiple addresses with commas.</small>
        </label>

        {recipientsLoadError ? (
          <p style={{ margin: 0, color: "#991b1b", fontWeight: 800 }}>
            {recipientsLoadError}
          </p>
        ) : null}

        {aliasCount > 0 ? (
          <p style={{ margin: 0, color: "#991b1b", fontWeight: 850 }}>
            Resolve {aliasCount} alias review item
            {aliasCount === 1 ? "" : "s"} before sending payroll.
          </p>
        ) : null}

        {message ? (
          <p style={{ margin: 0, color: "#166534", fontWeight: 800 }}>
            {message}
          </p>
        ) : null}
        {error ? (
          <p style={{ margin: 0, color: "#991b1b", fontWeight: 800 }}>
            {error}
          </p>
        ) : null}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button
            type="button"
            className="button"
            onClick={onClose}
            disabled={sending}
          >
            Close
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={sendReport}
            disabled={
              sending ||
              recipientsLoading ||
              !summary.length ||
              aliasCount > 0 ||
              !authorizedOperator
            }
          >
            {sending ? "Sending..." : "Send report"}
          </button>
        </div>
      </aside>
    </div>
  );
}
