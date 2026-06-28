"use client";

import { useState } from "react";
import type { PayrollSummaryRow } from "@/features/payroll/lib/payroll.types";
import { money } from "@/features/payroll/lib/payroll.format";

export default function PayrollReportEmailDialog({
  open,
  slug,
  weekEnd,
  summary,
  groupedSummaryRows,
  onClose,
}: {
  open: boolean;
  slug: string;
  weekEnd: string;
  summary: PayrollSummaryRow[];
  groupedSummaryRows: { group: string; rows: PayrollSummaryRow[] }[];
  onClose: () => void;
}) {
  const [recipientsText, setRecipientsText] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const estimatedTotal = summary.reduce((sum, row) => sum + Number(row.estimated_total ?? 0), 0);

  async function sendReport() {
    setSending(true);
    setMessage(null);
    setError(null);

    try {
      const recipients = recipientsText
        .split(/[,\n;]/)
        .map((value) => value.trim())
        .filter(Boolean);

      const res = await fetch(`/api/company/${slug}/payroll/report-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          weekEnd,
          recipients,
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

        <p style={{ margin: 0, color: "#64748b", fontSize: 12 }}>
          The signed-in user is automatically included.
        </p>

        {message ? <p style={{ margin: 0, color: "#166534", fontWeight: 800 }}>{message}</p> : null}
        {error ? <p style={{ margin: 0, color: "#991b1b", fontWeight: 800 }}>{error}</p> : null}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button type="button" className="button" onClick={onClose} disabled={sending}>
            Close
          </button>
          <button type="button" className="button button-primary" onClick={sendReport} disabled={sending || !summary.length}>
            {sending ? "Sending..." : "Send report"}
          </button>
        </div>
      </aside>
    </div>
  );
}
