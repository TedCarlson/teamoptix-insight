"use client";

import React, { useState } from "react";

const btn: React.CSSProperties = {
  padding: "12px 18px",
  borderRadius: 12,
  border: "1px solid currentColor",
  background: "transparent",
  color: "inherit",
  fontWeight: 750,
  opacity: 0.9,
  cursor: "pointer",
  textAlign: "left",
};

export default function PdfSendDemoButton() {
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function send() {
    setSending(true);
    setMsg(null);
    try {
      const res = await fetch("/api/pdf/kpi?email=1&mode=send", { method: "GET" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || json?.details || "Send failed");
      setMsg("✅ Email triggered successfully.");
    } catch (e: any) {
      setMsg(`❌ ${e?.message || "Send failed"}`);
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <button onClick={send} disabled={sending} style={btn}>
        {sending ? "Sending KPI PDF…" : "Send KPI PDF (email) →"}
      </button>
      {msg ? <div style={{ fontSize: 12, opacity: 0.85 }}>{msg}</div> : null}
    </div>
  );
}
