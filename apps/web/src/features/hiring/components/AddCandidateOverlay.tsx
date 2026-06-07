"use client";

import { useEffect, useState } from "react";

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
  font: "inherit",
};

const textareaStyle: React.CSSProperties = {
  padding: 12,
  borderRadius: 12,
  border: "1px solid #d6dfeb",
  font: "inherit",
  resize: "vertical",
};

function Field(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
}) {
  return (
    <label style={{ display: "grid", gap: 5 }}>
      <span className="hero-stat__label">{props.label}</span>
      <input
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        required={props.required}
        type={props.type ?? "text"}
        style={inputStyle}
      />
    </label>
  );
}

export default function AddCandidateOverlay(props: AddCandidateOverlayProps) {
  const { open, saving, error, onClose, onSubmit } = props;

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [workerType, setWorkerType] = useState("Driver");
  const [marketCode, setMarketCode] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open) return;

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", handleKey);

    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

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
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
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
        onMouseDown={(event) => event.stopPropagation()}
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

          <button
            className="button"
            type="button"
            disabled={saving}
            onClick={() => {
              setFullName("");
              setEmail("");
              setPhone("");
              setWorkerType("Driver");
              setMarketCode("");
              setNote("");
              onClose();
            }}
          >
            Close
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ marginTop: 16, display: "grid", gap: 12 }}>
          <Field label="Full name" value={fullName} onChange={setFullName} required />
          <Field label="Email" value={email} onChange={setEmail} type="email" />
          <Field label="Phone" value={phone} onChange={setPhone} />
          <Field label="Role / worker type" value={workerType} onChange={setWorkerType} />
          <Field label="Market / terminal code" value={marketCode} onChange={setMarketCode} />

          <label style={{ display: "grid", gap: 5 }}>
            <span className="hero-stat__label">Optional onboarding note</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              style={textareaStyle}
            />
          </label>

          {error ? <p style={{ color: "#c62828", margin: 0 }}>{error}</p> : null}

          <div className="cta-row" style={{ marginTop: 4 }}>
            <button className="button button-primary" type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save candidate"}
            </button>
            <button
              className="button"
              type="button"
              disabled={saving}
              onClick={() => {
                setFullName("");
                setEmail("");
                setPhone("");
                setWorkerType("Driver");
                setMarketCode("");
                setNote("");
                onClose();
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
