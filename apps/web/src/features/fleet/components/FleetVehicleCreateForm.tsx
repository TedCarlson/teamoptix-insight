"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { createPortal } from "react-dom";

type FieldProps = {
  label: string;
  name: string;
  placeholder?: string;
  required?: boolean;
  type?: "text" | "number";
  min?: string;
};

function Field({ label, name, placeholder, required, type = "text", min }: FieldProps) {
  return (
    <label className="fleet-vehicle-form__field">
      <span>{label}{required ? " *" : ""}</span>
      <input name={name} required={required} type={type} min={min} placeholder={placeholder} />
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

export default function FleetVehicleCreateForm({ companySlug }: { companySlug: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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

  return (
    <>
      <button type="button" className="button button-primary" onClick={() => setOpen(true)}>Add Vehicle</button>
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
                <h2 id="fleet-vehicle-dialog-title">Add vehicle</h2>
                <p>Establish the vehicle record used by inspections, maintenance, assignments, and operating-cost reporting.</p>
              </div>
              <button aria-label="Close add vehicle form" className="fleet-vehicle-dialog__close" disabled={busy} onClick={() => setOpen(false)} type="button">×</button>
            </header>

            <form className="fleet-vehicle-form" onSubmit={submit}>
              <fieldset>
                <legend>Fleet identity</legend>
                <div className="fleet-vehicle-form__grid fleet-vehicle-form__grid--three">
                  <Field label="Unit number" name="unit_number" placeholder="e.g. 430" required />
                  <SelectField label="FedEx class" name="vehicle_class_key" defaultValue="U10"><option>U10</option><option>U15</option><option>U20</option></SelectField>
                  <SelectField label="Vehicle type" name="vehicle_type" defaultValue="STEP_VAN"><option value="STEP_VAN">Step van</option><option value="CUTAWAY">Cutaway</option><option value="BOX_TRUCK">Box truck</option><option value="CARGO_VAN">Cargo van</option><option value="RENTAL">Rental</option></SelectField>
                </div>
              </fieldset>

              <fieldset>
                <legend>Vehicle details</legend>
                <div className="fleet-vehicle-form__grid fleet-vehicle-form__grid--four">
                  <Field label="Year" name="year" type="number" min="1900" placeholder="YYYY" />
                  <Field label="Make" name="make" />
                  <Field label="Model" name="model" />
                  <Field label="Odometer" name="odometer_miles" type="number" min="0" placeholder="Miles" />
                </div>
              </fieldset>

              <fieldset>
                <legend>Registration</legend>
                <div className="fleet-vehicle-form__grid fleet-vehicle-form__grid--registration">
                  <Field label="VIN" name="vin" placeholder="17-character VIN" />
                  <Field label="Plate number" name="plate_number" />
                  <Field label="Plate state" name="plate_state" placeholder="SC" />
                </div>
              </fieldset>

              <fieldset>
                <legend>Wheels and tires</legend>
                <div className="fleet-vehicle-form__grid fleet-vehicle-form__grid--three">
                  <Field label="Wheel size" name="wheel_size" placeholder="e.g. 19.5 in" />
                  <Field label="Front tire size" name="front_tire_size" placeholder="e.g. 225/70R19.5" />
                  <Field label="Rear tire size" name="rear_tire_size" placeholder="e.g. 225/70R19.5" />
                  <SelectField label="Rear configuration" name="rear_tire_configuration" defaultValue="DUAL"><option value="DUAL">Dual rear wheel</option><option value="SINGLE">Single rear wheel</option></SelectField>
                  <Field label="Tire type" name="tire_type" placeholder="Highway, all-season, commercial…" />
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
