"use client";

import { useState } from "react";

type AddCandidateOverlayProps = {
  open: boolean;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (payload: {
    full_name: string;
    email: string;
    phone: string;
    worker_type: string;
    market_code: string;
    note: string;
  }) => Promise<void>;
};

const inputStyle: React.CSSProperties = {
  height: 42,
  padding: "0 12px",
  borderRadius: 12,
  border: "1px solid #d6dfeb",
  background: "#fff",
};

export default function AddCandidateOverlay(props: AddCandidateOverlayProps) {
  const { open, saving, error, onClose, onSubmit } = props;

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [workerType, setWorkerType] = useState("Driver");
  const [marketCode, setMarketCode] = useState("");
  const [note, setNote] = useState("");

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    await onSubmit({
      full_name: fullName,
      email,
      phone,
      worker_type: workerType,
      market_code: marketCode,
      note,
    });
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        display: "grid",
        placeItems: "center",
        padding: 16,
        background: "rgba(15, 23, 42, 0.35)",
      }}
    >
      <section
        style={{
          width: "min(640px, 100%)",
          maxHeight: "calc(100vh - 32px)",
          overflow: "auto",
          border: "1px solid #d6dfeb",
          borderRadius: 22,
          background: "#fff",
          boxShadow: "0 24px 60px rgba(15, 23, 42, 0.16)",
          padding: 18,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div>
            <p className="eyebrow">Hiring</p>
            <h2 className="app-card__title">Add or update candidate</h2>
            <p className="app-card__body">
              Email match updates an existing candidate/person record. New email creates a candidate row.
            </p>
          </div>

          <button className="button" type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ marginTop: 16, display: "grid", gap: 12 }}>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Full name"
            required
            style={inputStyle}
          />

          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            type="email"
            style={inputStyle}
          />

          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone"
            style={inputStyle}
          />

          <input
            value={workerType}
            onChange={(e) => setWorkerType(e.target.value)}
            placeholder="Role / worker type"
            style={inputStyle}
          />

          <input
            value={marketCode}
            onChange={(e) => setMarketCode(e.target.value)}
            placeholder="Market / terminal code"
            style={inputStyle}
          />

          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional onboarding note"
            rows={4}
            style={{
              padding: 12,
              borderRadius: 12,
              border: "1px solid #d6dfeb",
              font: "inherit",
              resize: "vertical",
            }}
          />

          {error ? <p style={{ color: "#c62828", margin: 0 }}>{error}</p> : null}

          <div className="cta-row" style={{ marginTop: 4 }}>
            <button className="button button-primary" type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save candidate"}
            </button>
            <button className="button" type="button" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
