"use client";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
const field = { padding: "10px 12px", border: "1px solid #cbd5e1", borderRadius: 8, width: "100%" };

export default function FleetVehicleCreateForm({ companySlug }: { companySlug: string }) {
  const router = useRouter(); const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const body = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch(`/api/company/${companySlug}/fleet/vehicles`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json().catch(() => ({})); setBusy(false);
    if (!response.ok) return setError(result.error ?? "Unable to save vehicle.");
    setOpen(false); router.refresh();
  }
  if (!open) return <button type="button" className="button button-primary" onClick={() => setOpen(true)}>Add Vehicle</button>;
  return <form onSubmit={submit} style={{ marginTop: 14, display: "grid", gap: 10 }}>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10 }}>
      <input name="unit_number" required placeholder="Unit number" style={field} />
      <select name="vehicle_class_key" defaultValue="U10" style={field}><option>U10</option><option>U15</option><option>U20</option></select>
      <select name="vehicle_type" defaultValue="STEP_VAN" style={field}><option value="STEP_VAN">Step van</option><option value="CUTAWAY">Cutaway</option><option value="BOX_TRUCK">Box truck</option><option value="CARGO_VAN">Cargo van</option><option value="RENTAL">Rental</option></select>
      <input name="year" type="number" placeholder="Year" style={field} /><input name="make" placeholder="Make" style={field} /><input name="model" placeholder="Model" style={field} />
      <input name="vin" placeholder="VIN" style={field} /><input name="plate_number" placeholder="Plate" style={field} /><input name="plate_state" placeholder="Plate state" style={field} />
      <input name="odometer_miles" type="number" min="0" placeholder="Odometer" style={field} /><input name="wheel_size" placeholder="Wheel size" style={field} />
      <input name="front_tire_size" placeholder="Front tire size" style={field} /><input name="rear_tire_size" placeholder="Rear tire size" style={field} />
      <select name="rear_tire_configuration" defaultValue="DUAL" style={field}><option value="DUAL">Rear dual</option><option value="SINGLE">Rear single</option></select>
      <input name="tire_type" placeholder="Tire type" style={field} />
    </div>
    {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
    <div style={{ display: "flex", gap: 8 }}><button className="button button-primary" disabled={busy}>{busy ? "Saving…" : "Save Vehicle"}</button><button type="button" className="button" onClick={() => setOpen(false)}>Cancel</button></div>
  </form>;
}
