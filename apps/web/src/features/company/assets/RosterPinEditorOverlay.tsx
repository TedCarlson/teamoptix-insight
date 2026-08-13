"use client";

import { useEffect, useState } from "react";
import { updateRosterPin } from "./rosterPin.client";

type Props = {
  open: boolean;
  companySlug: string;
  rosterMemberId: string;
  rosterMemberName: string;
  currentPin: string | null | undefined;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
};

export default function RosterPinEditorOverlay({
  open,
  companySlug,
  rosterMemberId,
  rosterMemberName,
  currentPin,
  onClose,
  onChanged,
}: Props) {
  const [pin, setPin] = useState(currentPin ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPin(currentPin ?? "");
    setError(null);
  }, [currentPin, open]);

  if (!open) return null;

  const unchanged = pin.trim() === (currentPin ?? "").trim();

  async function save() {
    setSaving(true);
    setError(null);

    try {
      await updateRosterPin({
        companySlug,
        rosterMemberId,
        pin,
      });
      await onChanged();
      onClose();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to save driver PIN.",
      );
    } finally {
      setSaving(false);
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
        zIndex: 110,
        background: "rgba(15, 23, 42, 0.36)",
        display: "grid",
        placeItems: "center",
        padding: 16,
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Edit driver PIN"
        onMouseDown={(event) => event.stopPropagation()}
        style={{
          width: "min(560px, 100%)",
          background: "#fff",
          border: "1px solid #d6dfeb",
          borderRadius: 22,
          boxShadow: "0 24px 60px rgba(15,23,42,.22)",
          padding: 18,
          display: "grid",
          gap: 16,
        }}
      >
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div>
            <p className="workspace-eyebrow">Driver resource</p>
            <h2
              className="workspace-card-title"
              style={{ fontSize: 21 }}
            >
              PIN
            </h2>
            <p className="workspace-card-body" style={{ marginTop: 4 }}>
              Stored on {rosterMemberName}&apos;s roster record.
            </p>
          </div>

          <button
            className="button"
            type="button"
            disabled={saving}
            onClick={onClose}
          >
            Close
          </button>
        </header>

        <label style={{ display: "grid", gap: 6 }}>
          <span className="hero-stat__label">PIN</span>
          <input
            autoFocus
            autoComplete="off"
            spellCheck={false}
            value={pin}
            onChange={(event) => setPin(event.target.value)}
            placeholder="Enter PIN"
            style={{
              width: "100%",
              height: 42,
              borderRadius: 11,
              border: "1px solid #d6dfeb",
              padding: "0 11px",
            }}
          />
          <small style={{ color: "#64748b" }}>
            Enter any value needed for this driver. Clear the field to remove
            it.
          </small>
        </label>

        {error ? (
          <p style={{ color: "#b91c1c", margin: 0 }}>{error}</p>
        ) : null}

        <footer style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            className="button button-primary"
            type="button"
            disabled={saving || unchanged}
            onClick={save}
          >
            {saving ? "Saving..." : "Save PIN"}
          </button>
        </footer>
      </section>
    </div>
  );
}
