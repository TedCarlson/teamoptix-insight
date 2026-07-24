"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { FleetVehicleRow } from "../fleet.types";
import { validateVin } from "../lib/vin";
import VinCameraScanner from "./VinCameraScanner";

type FieldProps = {
  label: string;
  name: string;
  placeholder?: string;
  required?: boolean;
  type?: "text" | "number" | "date";
  min?: string;
  defaultValue?: string | number;
};

function Field({ label, name, placeholder, required, type = "text", min, defaultValue }: FieldProps) {
  return (
    <label className="fleet-vehicle-form__field">
      <span>{label}{required ? " *" : ""}</span>
      <input name={name} required={required} type={type} min={min} placeholder={placeholder} defaultValue={defaultValue} />
    </label>
  );
}

function SelectField({ label, name, defaultValue, children }: { label: string; name: string; defaultValue: string; children: React.ReactNode }) {
  return (
    <label className="fleet-vehicle-form__field">
      <span>{label}</span>
      <select name={name} defaultValue={defaultValue}>{children}</select>
    </label>
  );
}

export default function FleetVehicleCreateForm({ companySlug, vehicle }: { companySlug: string; vehicle?: FleetVehicleRow }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [decodeBusy, setDecodeBusy] = useState(false);
  const [error, setError] = useState("");
  const [decodeId, setDecodeId] = useState("");
  const [decoded, setDecoded] = useState<Record<string, string | number | null> | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [capturedVin, setCapturedVin] = useState("");

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) setOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open, busy]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const body = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch(`/api/company/${companySlug}/fleet/vehicles`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) return setError(result.error ?? "Unable to save vehicle.");
    setOpen(false);
    router.refresh();
  }

  function setField(name: string, value: string | number | null | undefined) {
    const field = formRef.current?.elements.namedItem(name);
    if ((field instanceof HTMLInputElement || field instanceof HTMLSelectElement) && value != null && value !== "") {
      field.value = String(value);
    }
  }

  const decodeVin = useCallback(async (vinInput?: string) => {
    const vinField = formRef.current?.elements.namedItem("vin");
    const candidate = vinInput ?? (vinField instanceof HTMLInputElement ? vinField.value : "");
    const validation = validateVin(candidate);
    if (!validation.valid) return setError(validation.error);

    setDecodeBusy(true);
    setError("");
    const response = await fetch(`/api/company/${companySlug}/fleet/vin-decode`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ vin: validation.vin }),
    });
    const result = await response.json().catch(() => ({}));
    setDecodeBusy(false);
    if (!response.ok) return setError(result.error ?? "Unable to decode VIN.");

    const suggested = result.suggested ?? {};
    setDecodeId(result.decode_id ?? "");
    setDecoded(suggested);
    setField("vin", result.vin);
    setField("year", suggested.year);
    setField("make", suggested.make);
    setField("model", suggested.model);
    setField("vehicle_type", suggested.vehicle_type);
    if (suggested.gvwr_label) {
      setField("gvwr_source", "VIN_DECODER");
      setField("gvwr_verified_status", "PENDING");
      setField("gvwr_evidence_reference", `NHTSA vPIC decode ${result.decode_id}`);
    }
  }, [companySlug]);

  const acceptScannedVin = useCallback((vin: string) => {
    setCapturedVin(vin);
    setScannerOpen(false);
    void decodeVin(vin);
  }, [decodeVin]);

  return (
    <>
      <button type="button" className={vehicle ? "button" : "button button-primary"} onClick={() => setOpen(true)}>{vehicle ? "View / edit" : "Add Vehicle"}</button>
      {open && typeof document !== "undefined" ? createPortal(
        <div className="fleet-vehicle-dialog__backdrop" onMouseDown={() => !busy && setOpen(false)}>
          <section
            aria-labelledby="fleet-vehicle-dialog-title"
            aria-modal="true"
            className="fleet-vehicle-dialog"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <header className="fleet-vehicle-dialog__header">
              <div>
                <p className="value-card__eyebrow">Fleet inventory</p>
                <h2 id="fleet-vehicle-dialog-title">{vehicle ? `Vehicle ${vehicle.unit_number}` : "Add vehicle"}</h2>
                <p>Establish the vehicle record used by inspections, maintenance, assignments, and operating-cost reporting.</p>
              </div>
              <button aria-label="Close add vehicle form" className="fleet-vehicle-dialog__close" disabled={busy} onClick={() => setOpen(false)} type="button">×</button>
            </header>

            <form className="fleet-vehicle-form" onSubmit={submit} ref={formRef}>
              {vehicle ? <input type="hidden" name="vehicle_id" value={vehicle.vehicle_id} /> : null}
              {vehicle ? <input type="hidden" name="status" value={vehicle.status} /> : null}
              {decodeId ? <input type="hidden" name="vin_decode_id" value={decodeId} /> : null}
              <fieldset>
                <legend>VIN intake</legend>
                <div className="fleet-vehicle-form__grid fleet-vehicle-form__grid--registration">
                  <Field label="VIN" name="vin" placeholder="17-character VIN" defaultValue={vehicle?.vin ?? undefined} />
                </div>
                {!vehicle ? (
                  <>
                    <div className="fleet-vehicle-form__vin-actions">
                      <button className="button button-primary" disabled={decodeBusy || busy} onClick={() => setScannerOpen(true)} type="button">
                        Scan VIN
                      </button>
                      <button className="button" disabled={decodeBusy || busy} onClick={() => void decodeVin()} type="button">
                        {decodeBusy ? "Looking up VIN…" : "Look up entered VIN"}
                      </button>
                    </div>
                    {scannerOpen ? <VinCameraScanner onCancel={() => setScannerOpen(false)} onDetected={acceptScannedVin} /> : null}
                    {capturedVin && decodeBusy ? <p className="fleet-vehicle-form__vin-progress" role="status">VIN {capturedVin} captured. Discovering vehicle details…</p> : null}
                  </>
                ) : null}
                {decoded ? (
                  <article className="app-card" style={{ padding: 12, marginTop: 12 }}>
                    <p className="value-card__eyebrow">NHTSA vPIC suggestion</p>
                    <strong>{[decoded.year, decoded.make, decoded.model].filter(Boolean).join(" ") || "Vehicle decoded"}</strong>
                    <p className="app-card__body" style={{ marginTop: 6 }}>
                      {[decoded.body_class, decoded.fuel_type, decoded.drive_type].filter(Boolean).join(" · ") || "No additional identity fields returned."}
                    </p>
                    <p className="app-card__body" style={{ marginTop: 6 }}>
                      GVWR range: {decoded.gvwr_label || "Not encoded"} · Verification required
                    </p>
                  </article>
                ) : null}
              </fieldset>

              <fieldset>
                <legend>Fleet identity</legend>
                <div className="fleet-vehicle-form__grid fleet-vehicle-form__grid--three">
                  <Field label="Unit number" name="unit_number" placeholder="e.g. 430" required defaultValue={vehicle?.unit_number} />
                  <SelectField label="FedEx class" name="vehicle_class_key" defaultValue={vehicle?.vehicle_class_key ?? "L10"}><option>L10</option><option>L15</option><option>L20</option></SelectField>
                  <SelectField label="Vehicle type" name="vehicle_type" defaultValue={vehicle?.vehicle_type ?? "STEP_VAN"}><option value="STEP_VAN">Step van</option><option value="CUTAWAY">Cutaway</option><option value="BOX_TRUCK">Box truck</option><option value="CARGO_VAN">Cargo van</option><option value="RENTAL">Rental</option><option value="OTHER">Other / review needed</option></SelectField>
                </div>
              </fieldset>

              <fieldset>
                <legend>Vehicle details</legend>
                <div className="fleet-vehicle-form__grid fleet-vehicle-form__grid--four">
                  <Field label="Year" name="year" type="number" min="1900" placeholder="YYYY" defaultValue={vehicle?.year ?? undefined} />
                  <Field label="Make" name="make" defaultValue={vehicle?.make ?? undefined} />
                  <Field label="Model" name="model" defaultValue={vehicle?.model ?? undefined} />
                  <Field label="Odometer" name="odometer_miles" type="number" min="0" placeholder="Miles" defaultValue={vehicle?.odometer_miles ?? undefined} />
                </div>
              </fieldset>

              <fieldset>
                <legend>Compliance identity</legend>
                <div className="fleet-vehicle-form__grid fleet-vehicle-form__grid--three">
                  <Field label="GVWR (lb)" name="gvwr_lbs" type="number" min="1" placeholder="Manufacturer rating" defaultValue={vehicle?.gvwr_lbs ?? undefined} />
                  <SelectField label="Evidence source" name="gvwr_source" defaultValue={vehicle?.gvwr_source ?? ""}>
                    <option value="">Not supplied</option>
                    <option value="MANUFACTURER_LABEL">Manufacturer label</option>
                    <option value="VIN_DECODER">VIN decoder</option>
                    <option value="MANUFACTURER_SPEC">Manufacturer specification</option>
                    <option value="TITLE">Title</option>
                    <option value="REGISTRATION">Registration</option>
                    <option value="LEASE_RECORD">Lease record</option>
                    <option value="MANUAL_ENTRY">Manual entry</option>
                  </SelectField>
                  <SelectField label="Classification status" name="gvwr_verified_status" defaultValue={vehicle?.gvwr_verified_status ?? "UNVERIFIED"}>
                    <option value="UNVERIFIED">Unverified</option>
                    <option value="PENDING">Pending verification</option>
                    <option value="VERIFIED">Verified</option>
                    <option value="DISPUTED">Disputed</option>
                    <option value="EXPIRED">Expired</option>
                  </SelectField>
                  <Field label="Evidence reference" name="gvwr_evidence_reference" placeholder="Document, label photo, or file reference" defaultValue={vehicle?.gvwr_evidence_reference ?? undefined} />
                  <Field label="Effective date" name="effective_start_date" type="date" />
                </div>
              </fieldset>

              <fieldset>
                <legend>Registration</legend>
                <div className="fleet-vehicle-form__grid fleet-vehicle-form__grid--registration">
                  <Field label="Plate number" name="plate_number" defaultValue={vehicle?.plate_number ?? undefined} />
                  <Field label="Plate state" name="plate_state" placeholder="SC" defaultValue={vehicle?.plate_state ?? undefined} />
                </div>
              </fieldset>

              <fieldset>
                <legend>Wheels and tires</legend>
                <div className="fleet-vehicle-form__grid fleet-vehicle-form__grid--three">
                  <Field label="Wheel size" name="wheel_size" placeholder="e.g. 19.5 in" defaultValue={vehicle?.wheel_size ?? undefined} />
                  <Field label="Front tire size" name="front_tire_size" placeholder="e.g. 225/70R19.5" defaultValue={vehicle?.front_tire_size ?? undefined} />
                  <Field label="Rear tire size" name="rear_tire_size" placeholder="e.g. 225/70R19.5" defaultValue={vehicle?.rear_tire_size ?? undefined} />
                  <SelectField label="Rear configuration" name="rear_tire_configuration" defaultValue={vehicle?.rear_tire_configuration ?? "DUAL"}><option value="DUAL">Dual rear wheel</option><option value="SINGLE">Single rear wheel</option></SelectField>
                  <Field label="Tire type" name="tire_type" placeholder="Highway, all-season, commercial…" defaultValue={vehicle?.tire_type ?? undefined} />
                </div>
              </fieldset>

              {error ? <p className="fleet-vehicle-form__error" role="alert">{error}</p> : null}
              <footer className="fleet-vehicle-form__actions">
                <button type="button" className="button" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
                <button className="button button-primary" disabled={busy}>{busy ? "Saving…" : "Save Vehicle"}</button>
              </footer>
            </form>
          </section>
        </div>,
        document.body
      ) : null}
    </>
  );
}
