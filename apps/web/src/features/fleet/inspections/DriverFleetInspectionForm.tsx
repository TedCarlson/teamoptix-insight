"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useAccess } from "@/features/access/AccessProvider";
import { IntentVerificationDrawer } from "@/features/security/components/IntentVerificationDrawer";
import type { FleetVehicleRow } from "../fleet.types";
import { fleetInspectionItems, requiredFleetEvidenceKeys } from "./inspection.catalog";

type ScheduleRow = { profile_id?: string | null; schedule_pending?: boolean | null; [key: string]: unknown };
const routeKeys = ["default_route_u", "default_route_m", "default_route_t", "default_route_w", "default_route_h", "default_route_f", "default_route_s"];

export default function DriverFleetInspectionForm({ companySlug, vehicles, context = "driver" }: { companySlug: string; vehicles: FleetVehicleRow[]; context?: "driver" | "manager" }) {
  const access = useAccess();
  const draftKey = `fleet-inspection:${companySlug}:${access.profile_id ?? "driver"}`;
  const [routeName, setRouteName] = useState<string | null>(null);
  const [vehicleId, setVehicleId] = useState("");
  const [scanCode, setScanCode] = useState("");
  const [odometer, setOdometer] = useState("");
  const [inspectionType, setInspectionType] = useState("PRE_TRIP");
  const [results, setResults] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [mediaPaths, setMediaPaths] = useState<Record<string, string[]>>({});
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [safeToOperate, setSafeToOperate] = useState("yes");
  const [driverNotes, setDriverNotes] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmingIntent, setConfirmingIntent] = useState(false);

  const selectedVehicle = vehicles.find((vehicle) => vehicle.vehicle_id === vehicleId) ?? null;
  const completed = fleetInspectionItems.filter(([, key]) => results[key]).length;
  const sections = useMemo(() => Array.from(new Set(fleetInspectionItems.map(([section]) => section))), []);

  useEffect(() => {
    if (context === "manager") return;
    fetch(`/api/company/${companySlug}/schedule`, { credentials: "include", cache: "no-store" })
      .then((response) => response.json())
      .then((body) => {
        const row = (body.rows as ScheduleRow[] | undefined)?.find((item) => item.profile_id === access.profile_id);
        const route = row?.schedule_pending ? null : row?.[routeKeys[new Date().getDay()]];
        setRouteName(typeof route === "string" && route.trim() ? route.trim() : null);
      })
      .catch(() => setRouteName(null));
  }, [access.profile_id, companySlug, context]);

  useEffect(() => {
    try {
      const draft = JSON.parse(localStorage.getItem(draftKey) ?? "null");
      if (!draft) return;
      queueMicrotask(() => {
        setVehicleId(draft.vehicleId ?? ""); setOdometer(draft.odometer ?? ""); setInspectionType(draft.inspectionType ?? "PRE_TRIP");
        setResults(draft.results ?? {}); setNotes(draft.notes ?? {}); setMediaPaths(draft.mediaPaths ?? {}); setSafeToOperate(draft.safeToOperate ?? "yes"); setDriverNotes(draft.driverNotes ?? "");
      });
    } catch { /* Ignore invalid local drafts. */ }
  }, [draftKey]);

  useEffect(() => {
    localStorage.setItem(draftKey, JSON.stringify({ vehicleId, odometer, inspectionType, results, notes, mediaPaths, safeToOperate, driverNotes }));
  }, [draftKey, driverNotes, inspectionType, mediaPaths, notes, odometer, results, safeToOperate, vehicleId]);

  async function uploadEvidence(itemKey: string, file: File) {
    if (!vehicleId) return setMessage("Select the vehicle before taking evidence photos.");
    setUploadingKey(itemKey); setMessage("");
    const form = new FormData(); form.set("file", file); form.set("vehicle_id", vehicleId); form.set("item_key", itemKey);
    const response = await fetch(`/api/company/${companySlug}/fleet/inspection-evidence`, { method: "POST", body: form });
    const body = await response.json().catch(() => ({})); setUploadingKey(null);
    if (!response.ok) return setMessage(body.error ?? "Photo upload failed.");
    setMediaPaths((current) => ({ ...current, [itemKey]: [...(current[itemKey] ?? []), body.storage_path] }));
  }

  function resolveScan() {
    const value = scanCode.trim().toLowerCase();
    const vehicle = vehicles.find((row) => [row.unit_number, row.fedex_vehicle_id, row.vin, row.plate_number].some((candidate) => candidate?.toLowerCase() === value));
    if (!vehicle) return setMessage("Vehicle code not found. Select the vehicle from the menu.");
    setVehicleId(vehicle.vehicle_id); setMessage("");
  }

  function requestSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!vehicleId) return setMessage("Scan or select a vehicle.");
    if (fleetInspectionItems.some(([, key]) => !results[key])) return setMessage("Complete every inspection point.");
    const missingEvidence = fleetInspectionItems.find(
      ([, key]) => requiredFleetEvidenceKeys.has(key) && !(mediaPaths[key]?.length)
    );
    if (missingEvidence) return setMessage(`Capture the required ${missingEvidence[2].toLowerCase()} photo with all lights on.`);
    setMessage("");
    setConfirmingIntent(true);
  }

  async function commitInspection() {
    setConfirmingIntent(false);
    setBusy(true); setMessage("");
    const items = fleetInspectionItems.map(([section, key, label]) => ({ section_key: section, item_key: key, item_label: label, result: results[key], notes: notes[key] ?? "", media_paths: mediaPaths[key] ?? [] }));
    const response = await fetch(`/api/company/${companySlug}/fleet/inspections`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ vehicle_id: vehicleId, inspection_type: inspectionType, odometer_miles: odometer, safe_to_operate: safeToOperate === "yes", driver_notes: driverNotes, route_name: routeName, items }) });
    const body = await response.json().catch(() => ({})); setBusy(false);
    if (!response.ok) return setMessage(body.error ?? "Inspection failed.");
    localStorage.removeItem(draftKey); setMessage(safeToOperate === "yes" ? "Inspection submitted." : "Inspection submitted. Vehicle placed out of service.");
    setResults({}); setNotes({}); setMediaPaths({}); setDriverNotes("");
  }

  return <form onSubmit={requestSubmit} className="driver-inspection-form">
    <header><p className="value-card__eyebrow">Fleet safety</p><h1>Vehicle Inspection</h1><p className="company-user-muted">{context === "manager" ? "Leadership inspection · independent of route assignment" : <>Route: <strong>{routeName ?? "Awaiting route assignment"}</strong></>}</p></header>
    <section className="app-card company-user-card"><h2>1. Confirm vehicle</h2><div className="driver-inspection-scan"><input value={scanCode} onChange={(e) => setScanCode(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); resolveScan(); } }} placeholder="Scan unit code"/><button type="button" className="button" onClick={resolveScan}>Use code</button></div><span className="driver-inspection-or">or</span><select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} required><option value="">Select vehicle</option>{vehicles.map((vehicle) => <option key={vehicle.vehicle_id} value={vehicle.vehicle_id}>{vehicle.unit_number} · {vehicle.vehicle_class_key ?? vehicle.vehicle_type}</option>)}</select>{selectedVehicle ? <div className="driver-inspection-vehicle"><strong>Unit {selectedVehicle.unit_number}</strong><span>{[selectedVehicle.year, selectedVehicle.make, selectedVehicle.model].filter(Boolean).join(" ") || selectedVehicle.vehicle_type.replaceAll("_", " ")}</span><span>Status: {selectedVehicle.status.replaceAll("_", " ")}</span>{selectedVehicle.open_defect_count > 0 ? <strong className="driver-inspection-warning">{selectedVehicle.open_defect_count} unresolved defect(s)</strong> : null}</div> : null}</section>
    <section className="app-card company-user-card"><h2>2. Inspection details</h2><div className="driver-inspection-details"><select value={inspectionType} onChange={(e) => setInspectionType(e.target.value)}><option value="PRE_TRIP">Pre-trip</option><option value="POST_TRIP">Post-trip</option><option value="MID_ROUTE">Mid-route</option></select><input value={odometer} onChange={(e) => setOdometer(e.target.value)} type="number" min="0" required placeholder="Odometer" /></div></section>
    <div className="driver-inspection-progress"><span>Inspection progress</span><strong>{completed} / {fleetInspectionItems.length}</strong><div><i style={{ width: `${completed / fleetInspectionItems.length * 100}%` }} /></div></div>
    {sections.map((section) => <section key={section} className="driver-inspection-section"><h2>{section.replaceAll("_", " ")}</h2>{fleetInspectionItems.filter(([itemSection]) => itemSection === section).map(([, key, label]) => { const requiresPhoto = requiredFleetEvidenceKeys.has(key); const showPhoto = requiresPhoto || results[key] === "DEFECT"; return <article key={key} className="app-card company-user-card driver-inspection-item"><strong>{label}</strong>{requiresPhoto ? <small>Required daily evidence · photograph with all lights on</small> : null}<div className="driver-inspection-result">{["PASS", "DEFECT", "NOT_APPLICABLE"].map((result) => <button key={result} type="button" className={results[key] === result ? `is-selected is-${result.toLowerCase()}` : ""} onClick={() => setResults((current) => ({ ...current, [key]: result }))}>{result === "NOT_APPLICABLE" ? "N/A" : result === "DEFECT" ? "Defect" : "Pass"}</button>)}</div>{results[key] === "DEFECT" ? <textarea required value={notes[key] ?? ""} onChange={(e) => setNotes((current) => ({ ...current, [key]: e.target.value }))} placeholder="Describe the defect and its location" /> : null}{showPhoto ? <><label className="driver-inspection-camera">{uploadingKey === key ? "Sanitizing and uploading photo…" : requiresPhoto ? "Take required photo" : "Take or attach photo"}<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={uploadingKey === key} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadEvidence(key, file); }} /></label>{(mediaPaths[key]?.length ?? 0) > 0 ? <small>{mediaPaths[key].length} photo(s) attached</small> : null}</> : null}</article>; })}</section>)}
    <section className="app-card company-user-card"><h2>Final declaration</h2><label>Is this vehicle safe to operate?<select value={safeToOperate} onChange={(e) => setSafeToOperate(e.target.value)}><option value="yes">Yes</option><option value="no">No — place out of service</option></select></label><textarea value={driverNotes} onChange={(e) => setDriverNotes(e.target.value)} placeholder="Additional driver notes" /></section>
    {message ? <p className="driver-inspection-message">{message}</p> : null}<button className="button button-primary driver-inspection-submit" disabled={busy}>{busy ? "Submitting…" : "Submit Inspection"}</button>
    {confirmingIntent ? <IntentVerificationDrawer action="VEHICLE_INSPECTION" busy={busy} onCancel={() => setConfirmingIntent(false)} onConfirm={() => void commitInspection()} /> : null}
  </form>;
}
