"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_FEDEX_ROLE,
  FEDEX_ROLE_OPTIONS,
} from "@/features/platform/roles/fedexRoleOptions";

export type AddCandidatePayload = {
  full_name: string;
  email: string;
  phone: string;
  worker_type: string;
  market_code: string;
  note: string;

  date_of_birth: string;
  fx_id: string;
  dswid: string;

  license_number: string;
  issuing_state: string;
  license_issue_date: string;
  license_expiration_date: string;

  address_line_1: string;
  address_line_2: string;
  city: string;
  state_region: string;
  postal_code: string;

  start_date: string;
  end_date: string;
  dot_expiration_date: string;
  qual_cert_expiration_date: string;

  daily_pay_rate: string;
  invite_action: "SAVE_ONLY" | "SEND_INVITE";
};

type AddCandidateOverlayProps = {
  open: boolean;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (payload: AddCandidatePayload) => Promise<void>;
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

const bucketStyle: React.CSSProperties = {
  display: "grid",
  gap: 10,
  padding: 12,
  border: "1px solid #e6edf5",
  borderRadius: 16,
  background: "#fbfdff",
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

function RoleField(props: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label style={{ display: "grid", gap: 5 }}>
      <span className="hero-stat__label">Role</span>
      <select
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        style={inputStyle}
      >
        {FEDEX_ROLE_OPTIONS.map((option) => (
          <option key={option.key} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function AddCandidateOverlay(props: AddCandidateOverlayProps) {
  const { open, saving, error, onClose, onSubmit } = props;

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [workerType, setWorkerType] = useState(DEFAULT_FEDEX_ROLE);
  const [marketCode, setMarketCode] = useState("");
  const [note, setNote] = useState("");

  const [dateOfBirth, setDateOfBirth] = useState("");
  const [fxId, setFxId] = useState("");
  const [dswid, setDswid] = useState("");

  const [licenseNumber, setLicenseNumber] = useState("");
  const [issuingState, setIssuingState] = useState("");
  const [licenseIssueDate, setLicenseIssueDate] = useState("");
  const [licenseExpirationDate, setLicenseExpirationDate] = useState("");

  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [stateRegion, setStateRegion] = useState("");
  const [postalCode, setPostalCode] = useState("");

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [dotExpirationDate, setDotExpirationDate] = useState("");
  const [qualCertExpirationDate, setQualCertExpirationDate] = useState("");
  const [dailyPayRate, setDailyPayRate] = useState("130");

  const [inviteAction, setInviteAction] =
    useState<"SAVE_ONLY" | "SEND_INVITE">("SAVE_ONLY");

  function reset() {
    setFullName("");
    setEmail("");
    setPhone("");
    setWorkerType(DEFAULT_FEDEX_ROLE);
    setMarketCode("");
    setNote("");

    setDateOfBirth("");
    setFxId("");
    setDswid("");

    setLicenseNumber("");
    setIssuingState("");
    setLicenseIssueDate("");
    setLicenseExpirationDate("");

    setAddressLine1("");
    setAddressLine2("");
    setCity("");
    setStateRegion("");
    setPostalCode("");

    setStartDate("");
    setEndDate("");
    setDotExpirationDate("");
    setQualCertExpirationDate("");
    setDailyPayRate("130");
    setInviteAction("SAVE_ONLY");
  }

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

      date_of_birth: dateOfBirth,
      fx_id: fxId,
      dswid,

      license_number: licenseNumber,
      issuing_state: issuingState,
      license_issue_date: licenseIssueDate,
      license_expiration_date: licenseExpirationDate,

      address_line_1: addressLine1,
      address_line_2: addressLine2,
      city,
      state_region: stateRegion,
      postal_code: postalCode,

      start_date: startDate,
      end_date: endDate,
      dot_expiration_date: dotExpirationDate,
      qual_cert_expiration_date: qualCertExpirationDate,

      daily_pay_rate: dailyPayRate,
      invite_action: inviteAction,
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
          width: "min(860px, 100%)",
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
            <h2 className="app-card__title">Add candidate</h2>
            <p className="app-card__body">
              Enter the known details once. Saving starts this candidate in onboarding; missing information can be completed later.
            </p>
          </div>

          <button
            className="button"
            type="button"
            disabled={saving}
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Close
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ marginTop: 16, display: "grid", gap: 14 }}>
          <section style={bucketStyle}>
            <p className="workspace-eyebrow" style={{ margin: 0 }}>Candidate identity</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
              <Field label="Full name" value={fullName} onChange={setFullName} required />
              <Field label="Email" value={email} onChange={setEmail} type="email" />
              <Field label="Phone" value={phone} onChange={setPhone} />
              <Field label="DOB" value={dateOfBirth} onChange={setDateOfBirth} type="date" />
              <RoleField value={workerType} onChange={setWorkerType} />
              <Field label="Market / terminal code" value={marketCode} onChange={setMarketCode} />
            </div>
          </section>

          <section style={bucketStyle}>
            <p className="workspace-eyebrow" style={{ margin: 0 }}>Driver license · Required</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
              <Field label="Driver's License" value={licenseNumber} onChange={setLicenseNumber} />
              <Field label="Issuing State" value={issuingState} onChange={setIssuingState} />
              <Field label="Issue Date" value={licenseIssueDate} onChange={setLicenseIssueDate} type="date" />
              <Field label="Expiration Date" value={licenseExpirationDate} onChange={setLicenseExpirationDate} type="date" />
            </div>
          </section>

          <section style={bucketStyle}>
            <p className="workspace-eyebrow" style={{ margin: 0 }}>Company roster details</p>
            <Field label="Address Line 1" value={addressLine1} onChange={setAddressLine1} />
            <Field label="Address Line 2" value={addressLine2} onChange={setAddressLine2} />
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10 }}>
              <Field label="City" value={city} onChange={setCity} />
              <Field label="State / Territory" value={stateRegion} onChange={setStateRegion} />
              <Field label="Zip Code" value={postalCode} onChange={setPostalCode} />
            </div>
          </section>

          <section style={bucketStyle}>
            <p className="workspace-eyebrow" style={{ margin: 0 }}>Operations readiness</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
              <Field label="FX ID" value={fxId} onChange={setFxId} />
              <Field label="DSWID" value={dswid} onChange={setDswid} />
              <Field label="Daily Pay" value={dailyPayRate} onChange={setDailyPayRate} type="number" />
              <Field label="Start Date" value={startDate} onChange={setStartDate} type="date" />
              <Field label="End Date" value={endDate} onChange={setEndDate} type="date" />
              <Field label="DOT Exp Date" value={dotExpirationDate} onChange={setDotExpirationDate} type="date" />
              <Field label="Qual Cert Exp Date" value={qualCertExpirationDate} onChange={setQualCertExpirationDate} type="date" />
            </div>
          </section>

          <section style={bucketStyle}>
            <p className="workspace-eyebrow" style={{ margin: 0 }}>Onboarding entry</p>
            <select
              value={inviteAction}
              onChange={(event) =>
                setInviteAction(event.target.value as "SAVE_ONLY" | "SEND_INVITE")
              }
              style={inputStyle}
            >
              <option value="SAVE_ONLY">Start onboarding without an invite</option>
              <option value="SEND_INVITE">Start onboarding and send invite</option>
            </select>
          </section>

          <label style={{ display: "grid", gap: 5 }}>
            <span className="hero-stat__label">Notes</span>
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
              {saving ? "Starting onboarding..." : inviteAction === "SEND_INVITE" ? "Start onboarding + send invite" : "Start onboarding"}
            </button>
            <button
              className="button"
              type="button"
              disabled={saving}
              onClick={() => {
                reset();
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
