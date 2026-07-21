"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

export type ScenarioOpportunity = {
  id: string; opportunity_number: string | null; station_name: string | null; listing_location: string | null;
  weekly_mileage: number | null; weekly_delivery_stops: number | null; weekly_delivery_packages: number | null;
  weekly_pickup_stops: number | null; weekly_pickup_packages: number | null;
  weekly_dispatch_min: number | null; weekly_dispatch_max: number | null;
};

type FleetDeployment = "OWNED" | "FINANCED" | "LEASED" | "RENTAL" | "AVP";
type DeploymentTerms = { purchasePrice: number; residualValue: number; usefulLifeYears: number; downPayment: number; annualInterestRate: number; loanTermYears: number; monthlyLease: number; rentalDailyRate: number; rentalDaysPerYear: number; avpRouteDayRate: number };
type FleetRow = { type: string; deployment: FleetDeployment; routes: number; vehicles: number; mpg: number; maintenancePerMile: number; tiresPerMile: number; insurancePerVehicle: number } & DeploymentTerms;
type RateBasis = "HOUR" | "DAY" | "WEEK" | "MONTH" | "YEAR";
type StaffRow = { role: string; count: number; rate: number; basis: RateBasis; hoursPerWeek: number };
type Inputs = { serviceDays: 6 | 7; revenueLow: number; revenueHigh: number; roadFactor: number; peakFactor: number; peakStartDate: string; peakEndDate: string; commercialLeadWeeks: number; residentialLeadWeeks: number; fuelPrice: number; driverDailyRate: number; payrollBurden: number; owner: StaffRow; fleet: FleetRow[]; staff: StaffRow[] };
type Detail = Record<string, unknown> & { zip_analysis?: { terminal?: Record<string, unknown>; rows?: Array<Record<string, unknown>>; unresolved_zip_codes?: string[] } };
type ModelVersion = { version_number: number; version_name?: string | null; assumption_snapshot?: Partial<Inputs> | null; created_at?: string | null };
const defaultOwner: StaffRow = { role:"Owner / Operator",count:1,rate:120000,basis:"YEAR",hoursPerWeek:40 };
const defaultDeploymentTerms: DeploymentTerms = { purchasePrice:0,residualValue:0,usefulLifeYears:7,downPayment:0,annualInterestRate:8,loanTermYears:5,monthlyLease:0,rentalDailyRate:0,rentalDaysPerYear:0,avpRouteDayRate:0 };

const initialInputs: Inputs = {
  serviceDays: 6, revenueLow: 130000, revenueHigh: 150000, roadFactor: 1.2, peakFactor: 1.25, ...corePeakDates(new Date().getFullYear()), commercialLeadWeeks: 3, residentialLeadWeeks: 1, fuelPrice: 3.65, driverDailyRate: 220, payrollBurden: .12, owner: defaultOwner,
  fleet: [
    { type: "Cargo van", deployment: "OWNED", routes: 0, vehicles: 0, mpg: 14, maintenancePerMile: .16, tiresPerMile: .025, insurancePerVehicle: 7500, ...defaultDeploymentTerms },
    { type: "Transit / Sprinter", deployment: "OWNED", routes: 0, vehicles: 0, mpg: 12, maintenancePerMile: .18, tiresPerMile: .03, insurancePerVehicle: 8000, ...defaultDeploymentTerms },
    { type: "P700", deployment: "OWNED", routes: 0, vehicles: 0, mpg: 10, maintenancePerMile: .18, tiresPerMile: .03, insurancePerVehicle: 8500, ...defaultDeploymentTerms },
    { type: "P1000", deployment: "OWNED", routes: 20, vehicles: 23, mpg: 8.5, maintenancePerMile: .24, tiresPerMile: .04, insurancePerVehicle: 9500, ...defaultDeploymentTerms },
    { type: "P1200 / Cutaway", deployment: "OWNED", routes: 0, vehicles: 0, mpg: 7.5, maintenancePerMile: .28, tiresPerMile: .05, insurancePerVehicle: 10500, ...defaultDeploymentTerms },
    { type: "16-ft Box", deployment: "OWNED", routes: 0, vehicles: 0, mpg: 7, maintenancePerMile: .30, tiresPerMile: .06, insurancePerVehicle: 11500, ...defaultDeploymentTerms },
  ],
  staff: [
    { role: "Business Contact", count: 1, rate: 1500, basis: "WEEK", hoursPerWeek: 40 },
    { role: "Fleet Manager", count: 0, rate: 1250, basis: "WEEK", hoursPerWeek: 40 },
    { role: "Mechanic", count: 0, rate: 35, basis: "HOUR", hoursPerWeek: 40 },
  ],
};

export default function OpportunityScenarioModel({ companySlug, opportunities, initialId }: { companySlug: string; opportunities: ScenarioOpportunity[]; initialId?: string }) {
  const [selectedId, setSelectedId] = useState(initialId && opportunities.some((item) => item.id === initialId) ? initialId : opportunities[0]?.id ?? "");
  const [draft, setDraft] = useState(() => freshInputs());
  const [applied, setApplied] = useState(() => freshInputs());
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [savingVersion, setSavingVersion] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [savedVersion, setSavedVersion] = useState<number | null>(null);
  const [savedVersionName, setSavedVersionName] = useState<string | null>(null);
  const [versionError, setVersionError] = useState<string | null>(null);
  const selected = opportunities.find((item) => item.id === selectedId);
  const hasPendingChanges = JSON.stringify(draft) !== JSON.stringify(applied);
  const reportFilename = prospectusFilename(selected);

  function printProspectus() {
    const previousTitle = document.title;
    document.title = reportFilename;
    window.addEventListener("afterprint", () => { document.title = previousTitle; }, { once: true });
    window.print();
  }

  async function saveModelVersion() {
    if (!selected || !result || hasPendingChanges) return;
    setSavingVersion(true);
    setVersionError(null);
    try {
      const response = await fetch(`/api/company/${companySlug}/opportunity-analysis/models`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ analysisId: selected.id, assumptions: applied, results: result, versionName: "Comparison checkpoint" }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to save model version.");
      setSavedVersion(Number(payload.version_number));
      setSavedVersionName("Comparison checkpoint");
    } catch (error) {
      setVersionError(error instanceof Error ? error.message : "Unable to save model version.");
    } finally {
      setSavingVersion(false);
    }
  }

  async function updateProspectus() {
    if (!selected || !draftResult || !hasPendingChanges || !fleetModelValid) return;
    setSavingDraft(true);
    setVersionError(null);
    try {
      const response = await fetch(`/api/company/${companySlug}/opportunity-analysis/models`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ analysisId: selected.id, assumptions: draft, results: draftResult, versionName: "Draft" }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to preserve this draft.");
      setApplied(structuredClone(draft));
      setUpdatedAt(payload.created_at ? new Date(payload.created_at) : new Date());
      setSavedVersion(Number(payload.version_number));
      setSavedVersionName("Draft");
    } catch (error) {
      setVersionError(error instanceof Error ? error.message : "Unable to preserve this draft.");
    } finally {
      setSavingDraft(false);
    }
  }

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    setLoading(true);
    setDetail(null);
    setSavedVersion(null);
    setSavedVersionName(null);
    setVersionError(null);
    Promise.all([
      fetch(`/api/company/${companySlug}/opportunity-analysis/opportunities?id=${selectedId}`, { signal: controller.signal }),
      fetch(`/api/company/${companySlug}/opportunity-analysis/models?analysisId=${selectedId}`, { signal: controller.signal }),
    ]).then(async ([detailResponse, versionsResponse]) => {
      if (!detailResponse.ok) throw new Error("Unable to load opportunity.");
      if (!versionsResponse.ok) throw new Error("Unable to load opportunity assumptions.");
      const [loadedDetail, versions] = await Promise.all([detailResponse.json(), versionsResponse.json()]);
      const latest = (Array.isArray(versions) ? versions[0] : null) as ModelVersion | null;
      const inputs = hydrateInputs(latest?.assumption_snapshot);
      setDetail(loadedDetail);
      setDraft(inputs);
      setApplied(structuredClone(inputs));
      setSavedVersion(latest ? Number(latest.version_number) : null);
      setSavedVersionName(latest?.version_name ?? null);
      setUpdatedAt(latest?.created_at ? new Date(latest.created_at) : null);
    }).catch((error) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      const inputs = freshInputs();
      setDetail(null);
      setDraft(inputs);
      setApplied(structuredClone(inputs));
      setVersionError(error instanceof Error ? error.message : "Unable to load opportunity.");
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [companySlug, selectedId]);

  const result = useMemo(() => calculate(selected, applied), [selected, applied]);
  const draftResult = useMemo(() => calculate(selected, draft), [selected, draft]);
  const zipRows = detail?.zip_analysis?.rows ?? [];
  const standardRows = zipRows.filter((row) => row.classification === "STANDARD" && row.population !== null);
  const specialRows = zipRows.filter((row) => row.classification === "UNIQUE" || row.classification === "PO_BOX");
  const draftSupport = supportStaff(draft);
  const fleetBounds = offerFleetBounds(selected, draft);
  const draftRouteCount = draft.fleet.reduce((total, row) => total + row.routes, 0);
  const draftVehicleCount = draft.fleet.reduce((total, row) => total + row.vehicles, 0);
  const fleetModelValid = draftRouteCount >= fleetBounds.routeMin && draftRouteCount <= fleetBounds.routeMax && draftVehicleCount >= draftRouteCount;

  if (!opportunities.length) return <article className="app-card" style={{ padding: 16 }}>Save an opportunity before creating a prospectus.</article>;
  if (loading) return <article className="app-card" style={{ padding: 16 }}>Loading opportunity model…</article>;
  return <section className="opportunity-prospectus-layout" style={{ display: "grid", gridTemplateColumns: "minmax(300px, 22%) minmax(0, 78%)", gap: 14, alignItems: "start" }}>
    <aside className="app-card prospectus-controls evidence-print-hide" style={{ padding: 14, display: "grid", gap: 14, position: "sticky", top: 12 }}>
      <div><strong>Prospectus controls</strong><p className="app-card__body" style={{ margin: "4px 0 0" }}>Edits are modeled assumptions.</p></div>
      <label><RailLabel>Opportunity</RailLabel><select value={selectedId} onChange={(event) => { setLoading(true); setDetail(null); setSelectedId(event.target.value); }} style={selectStyle}>{opportunities.map((item) => <option key={item.id} value={item.id}>{item.opportunity_number ?? "Unnumbered"} · {item.station_name}</option>)}</select></label>
      <RailSection title="Operations"><RailInput label="Service days" value={draft.serviceDays} suffix="days" onChange={(v) => setDraft({ ...draft, serviceDays: v === 7 ? 7 : 6 })} /><RailInput label="Centroid-to-road factor" value={draft.roadFactor} step={.05} suffix="×" onChange={(v) => setDraft({ ...draft, roadFactor: v })} /><RailInput label="Peak package factor" value={draft.peakFactor} step={.05} suffix="×" onChange={(v) => setDraft({ ...draft, peakFactor: v })} /><DateInput label="Core Peak begins" value={draft.peakStartDate} onChange={(value)=>setDraft({...draft,peakStartDate:value})} /><DateInput label="Core Peak ends" value={draft.peakEndDate} onChange={(value)=>setDraft({...draft,peakEndDate:value})} /><RailInput label="Commercial ramp lead" value={draft.commercialLeadWeeks} suffix="weeks" onChange={(value)=>setDraft({...draft,commercialLeadWeeks:value})} /><RailInput label="Residential ramp lead" value={draft.residentialLeadWeeks} suffix="weeks" onChange={(value)=>setDraft({...draft,residentialLeadWeeks:value})} /><ControlHelp title="How operations controls work"><p><strong>Service days</strong> determines operating days and annual driver-paid days.</p><p><strong>Centroid-to-road factor</strong> converts straight-line terminal distance into estimated road distance. It does not modify reported listing mileage.</p><p><strong>Commercial ramp</strong> defaults to three weeks before Black Friday; <strong>residential ramp</strong> defaults to one week before Black Friday.</p><p><strong>Core Peak</strong> defaults to Thanksgiving week through Christmas week. The Peak factor applies to capacity planning inside that window.</p></ControlHelp></RailSection>
      <RailSection title="Economics"><RailInput label="Revenue / route low" value={draft.revenueLow} step={5000} prefix="$" suffix="/ yr" onChange={(v) => setDraft({ ...draft, revenueLow: v })} /><RailInput label="Revenue / route high" value={draft.revenueHigh} step={5000} prefix="$" suffix="/ yr" onChange={(v) => setDraft({ ...draft, revenueHigh: v })} /><RailInput label="Fuel price" value={draft.fuelPrice} step={.05} prefix="$" suffix="/ gal" onChange={(v) => setDraft({ ...draft, fuelPrice: v })} /><ControlHelp title="How economics controls work"><p><strong>Revenue per route</strong> sets the low/high annual gross benchmark for each active route.</p><p><strong>Fuel price</strong> multiplies modeled gallons derived from reported miles and vehicle MPG.</p></ControlHelp></RailSection>
      <RailSection title="Labor"><RailInput label="Driver daily rate / route" value={draft.driverDailyRate} step={5} prefix="$" suffix="/ route-day" onChange={(v) => setDraft({ ...draft, driverDailyRate: v })} /><RailInput label="Payroll burden" value={draft.payrollBurden * 100} step={1} suffix="%" onChange={(v) => setDraft({ ...draft, payrollBurden: v / 100 })} /><ControlHelp title="How labor controls work"><p><strong>Driver daily rate</strong> is paid once per active route per service day.</p><p><strong>Payroll burden</strong> is the additional employer cost above wages. Twelve percent means $12 of taxes, workers’ compensation, benefits, and related burden for each $100 of wages.</p></ControlHelp></RailSection>
      <button className="button button-primary" type="button" disabled={savingDraft || !hasPendingChanges || !fleetModelValid} onClick={updateProspectus}>{!fleetModelValid ? "Resolve fleet bounds" : savingDraft ? "Preserving draft…" : hasPendingChanges ? "Update prospectus" : "Prospectus current"}</button>
      {updatedAt && !hasPendingChanges ? <div role="status" style={{ padding: "9px 10px", borderRadius: 10, background: "#ecfdf5", color: "#047857", fontSize: 12, fontWeight: 800 }}>Updated {updatedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</div> : null}
      <small className="app-card__body">Source facts remain unchanged. Each update preserves a versioned draft for this opportunity.</small>
    </aside>

    <article className="app-card opportunity-prospectus" style={{ padding: 18, display: "grid", gap: 18, overflow: "hidden" }}>
      <div className="prospectus-brand-band" style={{ display:"flex",alignItems:"center",justifyContent:"space-between",gap:16,paddingBottom:12,borderBottom:"1px solid #dbe3ef" }}>
        <div style={{display:"flex",alignItems:"center",gap:12}}><Image src="/icons/logo-2-insight-cutout-sm.png" alt="Insight by Team Optix" width={64} height={64} style={{width:64,height:64,objectFit:"contain"}} /><div><strong style={{display:"block",fontSize:24,letterSpacing:"-0.04em"}}>Insight</strong><span style={{color:"#059669",fontSize:11,fontWeight:900,letterSpacing:"0.12em"}}>BY TEAM OPTIX</span></div></div>
        <div style={{textAlign:"right"}}><strong style={{display:"block",fontSize:14}}>Insight Prospectus</strong><span className="app-card__body">Confidential · Prepared {new Date().toLocaleDateString()}</span></div>
      </div>
      <header style={{ borderBottom: "2px solid #0f172a", paddingBottom: 14 }}><p className="value-card__eyebrow">FedEx - P&amp;D Last Mile</p><h1 style={{ margin: 0 }}>{selected?.station_name}</h1><p className="app-card__body" style={{ margin: "4px 0 0" }}>{selected?.opportunity_number} · {selected?.listing_location} · Modeled prospectus</p></header>
      {result ? <>
        <ReportSection title="Executive assessment"><p style={{ margin: 0, lineHeight: 1.65 }}>This opportunity supports an estimated <strong>{result.routeCount} active routes</strong> with a modeled fleet of <strong>{result.vehicleCount} vehicles</strong>. Under the selected operating case, annual gross revenue is estimated at <strong>{money(result.revenueLow)}–{money(result.revenueHigh)}</strong>. Fleet, driver, payroll-burden, and support-role expenses total <strong>{money(result.totalOperatingCost)}</strong>, leaving a modeled contribution of <strong>{money(result.contributionLow)}–{money(result.contributionHigh)}</strong> before financing, taxes, and any expenses not yet represented.</p><Kpis values={[["Gross revenue range", `${money(result.revenueLow)}–${money(result.revenueHigh)}`],["Modeled operating cost", money(result.totalOperatingCost)],["Contribution range", `${money(result.contributionLow)}–${money(result.contributionHigh)}`],["Modeled margin range", `${percent(result.marginLow)}–${percent(result.marginHigh)}`]]} /></ReportSection>
        <div className="prospectus-page-one-details">
          <FactCard title="Opportunity facts" values={[["Weekly dispatches", `${selected?.weekly_dispatch_min}–${selected?.weekly_dispatch_max}`],["Weekly mileage", Number(selected?.weekly_mileage ?? 0).toLocaleString()],["Weekly stops", result.weeklyStops.toLocaleString()],["Weekly packages", result.weeklyPackages.toLocaleString()],["Peak daily packages", Math.round(result.peakDailyPackages).toLocaleString()],["Commercial ramp begins", seasonalRamp(applied,"commercial")],["Residential ramp begins", seasonalRamp(applied,"residential")],["Core Peak window", peakWindow(applied)],["Service days", applied.serviceDays],["ZIP evidence rows", zipRows.length]]} />
          <FactCard title="Territory intelligence" values={[["Residential population", sum(standardRows, "population").toLocaleString()],["Business establishments", sum(zipRows, "business_establishments").toLocaleString()],["Reported employment", sum(zipRows, "business_employment").toLocaleString()],["Residential / mappable ZIPs", standardRows.length],["Special-purpose ZIPs", specialRows.length],["Straight-line terminal miles", average(standardRows, "terminal_distance_miles").toFixed(1)],["Estimated road miles", (average(standardRows, "terminal_distance_miles")*applied.roadFactor).toFixed(1)],["Rurality factor", weightedRurality(standardRows).toFixed(2)],["Unresolved ZIPs", detail?.zip_analysis?.unresolved_zip_codes?.length ?? 0]]} />
        </div>
        <ReportSection title="Fleet plan and operating cost">
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:8}}><div className="context-stat"><span className="context-stat__label">Offer-derived daily routes</span><strong>{fleetBounds.routeMin}–{fleetBounds.routeMax}</strong></div><div className="context-stat"><span className="context-stat__label">Planned routes</span><strong style={{color:draftRouteCount>=fleetBounds.routeMin&&draftRouteCount<=fleetBounds.routeMax?"#0f172a":"#b45309"}}>{draftRouteCount}</strong></div><div className="context-stat"><span className="context-stat__label">Planned vehicles</span><strong style={{color:draftVehicleCount>=draftRouteCount?"#0f172a":"#b91c1c"}}>{draftVehicleCount}</strong></div><div className="context-stat"><span className="context-stat__label">Fleet target with 15% spares</span><strong>{Math.ceil(draftRouteCount*1.15)}</strong></div></div>
          {!fleetModelValid ? <p role="alert" style={{margin:0,padding:"9px 11px",border:"1px solid #f59e0b",borderRadius:10,background:"#fffbeb",color:"#92400e",fontWeight:700}}>Fleet mix must total {fleetBounds.routeMin}–{fleetBounds.routeMax} routes from the offer’s {selected?.weekly_dispatch_min}–{selected?.weekly_dispatch_max} weekly dispatches across {draft.serviceDays} service days, with at least one vehicle per active route.</p> : null}
          <div style={{ overflowX: "auto" }}><table className="prospectus-fleet-table" style={{ width: "100%", borderCollapse: "collapse", minWidth: 1450 }}><thead><tr>{["Vehicle type","Deployment","Daily routes","Fleet units","MPG","Annual miles","Fuel","Maintenance","Tires","Insurance","Deployment cost","Total",""] .map((label) => <Th key={label || "actions"}>{label}</Th>)}</tr></thead><tbody>{draft.fleet.map((row, index) => { const cost = draftResult?.rows[index] ?? {annualMiles:0,fuelCost:0,deploymentCost:0,total:0}; return <tr key={`${row.type}-${index}`}><td style={{padding:5,borderBottom:"1px solid #e2e8f0"}}><input aria-label="Vehicle type" value={row.type} onChange={(event)=>updateFleetRow(setDraft,draft,index,{type:event.target.value})} style={{...inputStyle,marginTop:0,minWidth:150}} /></td><td style={{padding:5,borderBottom:"1px solid #e2e8f0"}}><select aria-label="Deployment method" value={row.deployment} onChange={(event)=>updateFleetRow(setDraft,draft,index,{deployment:event.target.value as FleetDeployment})} style={tableSelectStyle}><option value="OWNED">Owned</option><option value="FINANCED">Financed</option><option value="LEASED">Leased</option><option value="RENTAL">Rental</option><option value="AVP">AVP</option></select></td><Editable value={row.routes} step={1} onChange={(routes) => updateFleetRow(setDraft, draft, index, {routes})} /><Editable value={row.vehicles} step={1} onChange={(vehicles) => updateFleetRow(setDraft, draft, index, {vehicles})} /><Editable value={row.mpg} step={.5} decimals={1} suffix="mpg" onChange={(mpg) => updateFleetRow(setDraft, draft, index, {mpg})} /><Td>{Math.round(cost.annualMiles).toLocaleString()}</Td><Td>{money(cost.fuelCost)}</Td><Editable value={row.maintenancePerMile} step={.01} decimals={2} prefix="$" suffix="/mi" onChange={(maintenancePerMile) => updateFleetRow(setDraft, draft, index, {maintenancePerMile})} /><Editable value={row.tiresPerMile} step={.01} decimals={2} prefix="$" suffix="/mi" onChange={(tiresPerMile) => updateFleetRow(setDraft, draft, index, {tiresPerMile})} /><Editable value={row.insurancePerVehicle} step={500} prefix="$" suffix="/yr" onChange={(insurancePerVehicle) => updateFleetRow(setDraft, draft, index, {insurancePerVehicle})} /><Td><strong>{money(cost.deploymentCost)}</strong></Td><Td><strong>{money(cost.total)}</strong></Td><Td>{draft.fleet.length>1?<button type="button" onClick={()=>removeFleetRow(setDraft,draft,index)} style={removeButton}>Remove</button>:<span style={{fontSize:11,color:"#64748b",fontWeight:800}}>Required row</span>}</Td></tr>;})}</tbody></table></div>
          <div className="evidence-print-hide" style={{display:"grid",gap:8}}>{draft.fleet.map((row,index)=><DeploymentTermsEditor key={`${row.type}-terms-${index}`} row={row} index={index} inputs={draft} setInputs={setDraft} />)}</div>
          <div className="prospectus-fleet-print">
            <h3>Fleet mix</h3>
            <table><thead><tr>{["Vehicle type","Deployment","Daily routes","Fleet units","MPG","Annual miles"].map((label)=><Th key={label}>{label}</Th>)}</tr></thead><tbody>{applied.fleet.map((row,index)=>({row,index})).filter(({row})=>row.routes>0||row.vehicles>0).map(({row,index})=><tr key={`${row.type}-print-mix-${index}`}><Td>{row.type}</Td><Td>{deploymentLabel(row.deployment)}</Td><Td>{row.routes}</Td><Td>{row.vehicles}</Td><Td>{row.mpg.toFixed(1)}</Td><Td>{Math.round(result.rows[index]?.annualMiles??0).toLocaleString()}</Td></tr>)}</tbody></table>
            <h3>Annual fleet operating cost</h3>
            <table><thead><tr>{["Vehicle type","Fuel","Maintenance","Tires","Insurance","Deployment","Total"].map((label)=><Th key={label}>{label}</Th>)}</tr></thead><tbody>{applied.fleet.map((row,index)=>({row,index})).filter(({row})=>row.routes>0||row.vehicles>0).map(({row,index})=>{const cost=result.rows[index];return <tr key={`${row.type}-print-cost-${index}`}><Td>{row.type}</Td><Td>{money(cost?.fuelCost??0)}</Td><Td>{money(cost?.maintenance??0)}</Td><Td>{money(cost?.tires??0)}</Td><Td>{money(cost?.insurance??0)}</Td><Td>{money(cost?.deploymentCost??0)}</Td><Td><strong>{money(cost?.total??0)}</strong></Td></tr>;})}</tbody></table>
          </div>
          <div><button type="button" className="button" onClick={()=>addFleetRow(setDraft,draft)}>+ Add vehicle type</button></div>
          <small className="app-card__body">Deployment cost is derived from the terms entered for each deployment method. Select Update Prospectus to apply the pending fleet economics to the report.</small>
        </ReportSection>
        <ReportSection title="Labor and operating leadership">
          <p style={{ margin: 0, lineHeight: 1.65 }}>Driver labor is modeled as a daily rate for every active route across {applied.serviceDays} service days. Leadership and support roles may be included only when the operating design requires them.</p>
          <Kpis values={[["Driver wages", money(result.driverWages)],["Payroll burden", money(result.payrollBurdenCost)],["Owner compensation", money(result.ownerCompensation)],["Other leadership / support", money(result.staffCost)],["Total modeled labor", money(result.totalLaborCost)]]} />
          <div style={{ overflowX: "auto" }}><table className="prospectus-labor-table" style={{ width: "100%", borderCollapse: "collapse", minWidth: 1040 }}><thead><tr>{["Role","Count","Rate","Basis","Hours / week","Annual cost",""] .map((label)=><Th key={label || "actions"}>{label}</Th>)}</tr></thead><tbody><OwnerRow inputs={draft} setInputs={setDraft} annualCost={result.ownerCompensation} />{draftSupport.map((editable,index)=><tr key={`${editable.role}-${index}`}><td style={{padding:5,borderBottom:"1px solid #e2e8f0"}}><input aria-label="Role name" value={editable.role} onChange={(event)=>updateSupport(setDraft,draft,index,{role:event.target.value})} style={{...inputStyle,marginTop:0,minWidth:170}} /></td><Editable value={editable.count} step={1} onChange={(count)=>updateSupport(setDraft,draft,index,{count})} /><Editable value={editable.rate} step={editable.basis==="HOUR"?1:editable.basis==="YEAR"?5000:50} prefix="$" suffix={rateSuffix(editable.basis)} onChange={(rate)=>updateSupport(setDraft,draft,index,{rate})} /><td style={{padding:5,borderBottom:"1px solid #e2e8f0"}}><select value={editable.basis} onChange={(event)=>updateSupport(setDraft,draft,index,{basis:event.target.value as RateBasis})} style={tableSelectStyle}><option value="HOUR">Per hour</option><option value="DAY">Per day</option><option value="WEEK">Per week</option><option value="MONTH">Per month</option><option value="YEAR">Per year</option></select></td>{editable.basis==="HOUR"?<Editable value={editable.hoursPerWeek} step={5} suffix="hrs" onChange={(hoursPerWeek)=>updateSupport(setDraft,draft,index,{hoursPerWeek})} />:<Td>—</Td>}<Td><strong>{money(annualStaffCost(editable,draft.serviceDays))}</strong></Td><Td><button type="button" onClick={()=>removeSupport(setDraft,draft,index)} style={removeButton}>Remove</button></Td></tr>)}</tbody></table></div>
          <div><button type="button" className="button" onClick={()=>addSupport(setDraft,draft)}>+ Add operating role</button></div>
          <small className="app-card__body">Hourly roles use hours per week. Daily roles use service days. Weekly and monthly roles use their selected pay frequency.</small>
        </ReportSection>
        <ReportSection title="ZIP evidence appendix"><div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1050 }}><thead><tr>{["ZIP","City","Type","RUCA","Population","People / sq mi","Establishments","Employees / sq mi","Terminal miles","Centroid"].map((label) => <Th key={label}>{label}</Th>)}</tr></thead><tbody>{zipRows.map((row) => <tr key={String(row.zip_code)}><Td><strong>{String(row.zip_code)}</strong></Td><Td>{String(row.preferred_city ?? "—")}, {String(row.state_code ?? "")}</Td><Td>{String(row.classification).replaceAll("_"," ")}</Td><Td>{row.ruca_category ? String(row.ruca_category).replaceAll("_"," ") : "—"}</Td><Td>{format(row.population)}</Td><Td>{format(row.population_density_per_sqmi)}</Td><Td>{format(row.business_establishments)}</Td><Td>{format(row.employees_per_sqmi)}</Td><Td>{Number(row.terminal_distance_miles ?? 0).toFixed(1)}</Td><Td>{String(row.coordinate_source ?? "—")}</Td></tr>)}</tbody></table></div><MethodologyNotes /></ReportSection>
        <footer className="evidence-print-hide" style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems:"center", flexWrap:"wrap" }}><span><small className="app-card__body">Suggested filename: {reportFilename}.pdf</small>{savedVersion ? <small role="status" style={{display:"block",color:"#047857",fontWeight:800}}>{savedVersionName === "Draft" ? "Draft" : "Model"} version {savedVersion} preserved in the warehouse.</small> : null}{versionError ? <small role="alert" style={{display:"block",color:"#b91c1c",fontWeight:800}}>{versionError}</small> : null}</span><span style={{display:"flex",gap:8}}><button className="button" type="button" disabled={savingVersion || hasPendingChanges} onClick={saveModelVersion}>{savingVersion ? "Saving checkpoint…" : hasPendingChanges ? "Update before saving" : "Save comparison checkpoint"}</button><button className="button button-primary" onClick={printProspectus}>Print / Save PDF</button></span></footer>
        <div className="prospectus-print-footer">Insight by Team Optix · {selected?.opportunity_number} · Confidential</div>
      </> : null}
    </article>
  </section>;
}

function calculate(opportunity: ScenarioOpportunity | undefined, inputs: Inputs) {
  if (!opportunity) return null;
  const weeklyStops = Number(opportunity.weekly_delivery_stops ?? 0) + Number(opportunity.weekly_pickup_stops ?? 0);
  const weeklyPackages = Number(opportunity.weekly_delivery_packages ?? 0) + Number(opportunity.weekly_pickup_packages ?? 0);
  const baseAnnualMiles = Number(opportunity.weekly_mileage ?? 0) * 52;
  const totalRoutes = inputs.fleet.reduce((sum, row) => sum + row.routes, 0) || 1;
  const rows = inputs.fleet.map((row) => {
    const annualMiles = baseAnnualMiles * (row.routes / totalRoutes);
    const fuelGallons = row.mpg > 0 ? annualMiles / row.mpg : 0;
    const fuelCost = fuelGallons * inputs.fuelPrice;
    const maintenance = annualMiles * row.maintenancePerMile;
    const tires = annualMiles * row.tiresPerMile;
    const insurance = row.deployment === "AVP" ? 0 : row.vehicles * row.insurancePerVehicle;
    const deploymentCost = annualDeploymentCost(row, inputs.serviceDays);
    return { annualMiles, fuelGallons, fuelCost, maintenance, tires, insurance, deploymentCost, total: fuelCost + maintenance + tires + insurance + deploymentCost };
  });
  const routeCount = inputs.fleet.reduce((s,r)=>s+r.routes,0);
  const revenueLow = routeCount * inputs.revenueLow;
  const revenueHigh = routeCount * inputs.revenueHigh;
  const driverWages = routeCount * inputs.serviceDays * 52 * inputs.driverDailyRate;
  const payrollBurdenCost = driverWages * inputs.payrollBurden;
  const staffRows = supportStaff(inputs).map((row) => annualStaffCost(row, inputs.serviceDays));
  const staffCost = staffRows.reduce((sum,value)=>sum+value,0);
  const ownerCompensation = annualStaffCost(inputs.owner ?? defaultOwner, inputs.serviceDays);
  const fleetCost = rows.reduce((s,r)=>s+r.total,0);
  const totalLaborCost = driverWages + payrollBurdenCost + ownerCompensation + staffCost;
  const totalOperatingCost = fleetCost + totalLaborCost;
  const contributionLow = revenueLow-totalOperatingCost;
  const contributionHigh = revenueHigh-totalOperatingCost;
  return { weeklyStops, weeklyPackages, peakDailyPackages: weeklyPackages / inputs.serviceDays * inputs.peakFactor, routeCount, vehicleCount: inputs.fleet.reduce((s,r)=>s+r.vehicles,0), annualMiles: rows.reduce((s,r)=>s+r.annualMiles,0), fuelGallons: rows.reduce((s,r)=>s+r.fuelGallons,0), fleetCost, revenueLow, revenueHigh, driverWages, payrollBurdenCost, staffRows, staffCost, ownerCompensation, totalLaborCost, totalOperatingCost, contributionLow, contributionHigh, marginLow: revenueLow ? contributionLow/revenueLow : 0, marginHigh: revenueHigh ? contributionHigh/revenueHigh : 0, rows };
}

function offerFleetBounds(opportunity: ScenarioOpportunity | undefined, inputs: Inputs) {
  const weeklyMin = Number(opportunity?.weekly_dispatch_min ?? 0);
  const weeklyMax = Number(opportunity?.weekly_dispatch_max ?? weeklyMin);
  if (!weeklyMin && !weeklyMax) return { routeMin: 1, routeMax: Number.MAX_SAFE_INTEGER };
  return {
    routeMin: Math.max(1, Math.floor(weeklyMin / inputs.serviceDays)),
    routeMax: Math.max(1, Math.ceil(weeklyMax / inputs.serviceDays)),
  };
}

function updateFleetRow(setter:(value:Inputs)=>void,inputs:Inputs,index:number,patch:Partial<FleetRow>) { const fleet=inputs.fleet.map((row,i)=>i===index?{...row,...patch}:row); setter({...inputs,fleet}); }
function removeFleetRow(setter:(value:Inputs)=>void,inputs:Inputs,index:number) { if(inputs.fleet.length<=1)return; setter({...inputs,fleet:inputs.fleet.filter((_,i)=>i!==index)}); }
function addFleetRow(setter:(value:Inputs)=>void,inputs:Inputs) { setter({...inputs,fleet:[...inputs.fleet,{type:"New vehicle type",deployment:"OWNED",routes:0,vehicles:0,mpg:8,maintenancePerMile:.25,tiresPerMile:.04,insurancePerVehicle:9500,...defaultDeploymentTerms}]}); }
function annualDeploymentCost(row:FleetRow,serviceDays:number) {
  if(row.deployment==="OWNED") return row.vehicles*Math.max(0,row.purchasePrice-row.residualValue)/Math.max(1,row.usefulLifeYears);
  if(row.deployment==="FINANCED") {
    const principal=Math.max(0,row.purchasePrice-row.downPayment);
    const monthlyRate=Math.max(0,row.annualInterestRate)/1200;
    const months=Math.max(1,row.loanTermYears*12);
    const monthly=monthlyRate ? principal*(monthlyRate*Math.pow(1+monthlyRate,months))/(Math.pow(1+monthlyRate,months)-1) : principal/months;
    return row.vehicles*monthly*12;
  }
  if(row.deployment==="LEASED") return row.vehicles*row.monthlyLease*12;
  if(row.deployment==="RENTAL") return row.vehicles*row.rentalDailyRate*row.rentalDaysPerYear;
  return row.routes*serviceDays*52*row.avpRouteDayRate;
}
function deploymentLabel(value:FleetDeployment) { return value==="AVP" ? "AVP" : value.charAt(0)+value.slice(1).toLowerCase(); }
function DeploymentTermsEditor({row,index,inputs,setInputs}:{row:FleetRow;index:number;inputs:Inputs;setInputs:(value:Inputs)=>void}) {
  const update=(patch:Partial<FleetRow>)=>updateFleetRow(setInputs,inputs,index,patch);
  return <details style={{border:"1px solid #dbe3ef",borderRadius:10,padding:"8px 10px",background:"#f8fafc"}}><summary style={{cursor:"pointer",fontWeight:800}}>{row.type} · {deploymentLabel(row.deployment)} terms · {money(annualDeploymentCost(row,inputs.serviceDays))}/year</summary><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:8,paddingTop:10}}>
    {row.deployment==="OWNED"?<><RailInput label="Purchase price / vehicle" value={row.purchasePrice} step={1000} prefix="$" onChange={(purchasePrice)=>update({purchasePrice})}/><RailInput label="Residual value / vehicle" value={row.residualValue} step={500} prefix="$" onChange={(residualValue)=>update({residualValue})}/><RailInput label="Useful life" value={row.usefulLifeYears} step={1} suffix="years" onChange={(usefulLifeYears)=>update({usefulLifeYears})}/></>:null}
    {row.deployment==="FINANCED"?<><RailInput label="Purchase price / vehicle" value={row.purchasePrice} step={1000} prefix="$" onChange={(purchasePrice)=>update({purchasePrice})}/><RailInput label="Down payment / vehicle" value={row.downPayment} step={500} prefix="$" onChange={(downPayment)=>update({downPayment})}/><RailInput label="APR" value={row.annualInterestRate} step={.25} suffix="%" onChange={(annualInterestRate)=>update({annualInterestRate})}/><RailInput label="Loan term" value={row.loanTermYears} step={1} suffix="years" onChange={(loanTermYears)=>update({loanTermYears})}/></>:null}
    {row.deployment==="LEASED"?<RailInput label="Monthly lease / vehicle" value={row.monthlyLease} step={50} prefix="$" suffix="/month" onChange={(monthlyLease)=>update({monthlyLease})}/>:null}
    {row.deployment==="RENTAL"?<><RailInput label="Rental rate / vehicle" value={row.rentalDailyRate} step={5} prefix="$" suffix="/day" onChange={(rentalDailyRate)=>update({rentalDailyRate})}/><RailInput label="Deployed days / year" value={row.rentalDaysPerYear} step={5} suffix="days" onChange={(rentalDaysPerYear)=>update({rentalDaysPerYear})}/></>:null}
    {row.deployment==="AVP"?<RailInput label="AVP reimbursement" value={row.avpRouteDayRate} step={5} prefix="$" suffix="/route-day" onChange={(avpRouteDayRate)=>update({avpRouteDayRate})}/>:null}
  </div></details>;
}
function freshInputs(): Inputs { return structuredClone(initialInputs); }
function hydrateInputs(snapshot?: Partial<Inputs> | null): Inputs {
  const defaults = freshInputs();
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return defaults;
  return {
    ...defaults,
    ...snapshot,
    owner: snapshot.owner ? { ...defaults.owner, ...snapshot.owner } : defaults.owner,
    fleet: Array.isArray(snapshot.fleet)
      ? snapshot.fleet.map((row) => ({ ...defaultDeploymentTerms, ...row }))
      : defaults.fleet,
    staff: Array.isArray(snapshot.staff) ? snapshot.staff : defaults.staff,
  };
}
function supportStaff(inputs:Inputs) { return (inputs.staff??[]).filter((row)=>row.role.trim().toLowerCase()!=="owner / operator"); }
function updateSupport(setter:(value:Inputs)=>void,inputs:Inputs,index:number,patch:Partial<StaffRow>) { const staff=supportStaff(inputs).map((row,i)=>i===index?{...row,...patch}:row); setter({...inputs,staff}); }
function removeSupport(setter:(value:Inputs)=>void,inputs:Inputs,index:number) { setter({...inputs,staff:supportStaff(inputs).filter((_,i)=>i!==index)}); }
function addSupport(setter:(value:Inputs)=>void,inputs:Inputs) { setter({...inputs,staff:[...supportStaff(inputs),{role:"New operating role",count:1,rate:0,basis:"WEEK",hoursPerWeek:40}]}); }
function OwnerRow({inputs,setInputs,annualCost}:{inputs:Inputs;setInputs:(value:Inputs)=>void;annualCost:number}) { const owner=inputs.owner??defaultOwner; const update=(patch:Partial<StaffRow>)=>setInputs({...inputs,owner:{...owner,...patch}}); return <tr><Td><strong>Owner / Operator</strong></Td><Editable value={owner.count} step={1} onChange={(count)=>update({count})} /><Editable value={owner.rate} step={owner.basis==="HOUR"?1:owner.basis==="YEAR"?5000:50} prefix="$" suffix={rateSuffix(owner.basis)} onChange={(rate)=>update({rate})} /><td style={{padding:5,borderBottom:"1px solid #e2e8f0"}}><select value={owner.basis} onChange={(event)=>update({basis:event.target.value as RateBasis})} style={tableSelectStyle}><option value="HOUR">Per hour</option><option value="DAY">Per day</option><option value="WEEK">Per week</option><option value="MONTH">Per month</option><option value="YEAR">Per year</option></select></td>{owner.basis==="HOUR"?<Editable value={owner.hoursPerWeek} step={5} suffix="hrs" onChange={(hoursPerWeek)=>update({hoursPerWeek})} />:<Td>—</Td>}<Td><strong>{money(annualCost)}</strong></Td><Td><span style={{fontSize:11,color:"#64748b",fontWeight:800}}>Required row</span></Td></tr>; }
function annualStaffCost(row:StaffRow,serviceDays:number) { return row.count*row.rate*(row.basis==="HOUR"?row.hoursPerWeek*52:row.basis==="DAY"?serviceDays*52:row.basis==="WEEK"?52:row.basis==="MONTH"?12:1); }
function ReportSection({ title, children }: { title: string; children: React.ReactNode }) { return <section style={{ display: "grid", gap: 10 }}><h2 style={{ margin: 0, paddingBottom: 6, borderBottom: "1px solid #cbd5e1" }}>{title}</h2>{children}</section>; }
function FactCard({title,values}:{title:string;values:Array<[string,string|number]>}) { return <article className="prospectus-fact-card"><h2>{title}</h2><dl>{values.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></article>; }
function MethodologyNotes() { const sources=[
  ["ZIP identity", "Imported ZIP classification reference (standard, unique, and PO Box)."],
  ["Centroids", "HUD ZIP Code Population Weighted Centroids; vendor coordinates supplement ZIPs without HUD coverage."],
  ["Residential", "U.S. Census ACS 2024 population and Census Gazetteer 2024 ZCTA land area."],
  ["Commercial", "U.S. Census ZIP Code Business Patterns 2023 establishments and reported employment."],
  ["Rurality", "USDA ERS 2020 RUCA ZIP release mapped to the TeamOptix 0.00-1.00 operating continuum."],
  ["Terminal", "Submitted terminal address resolved with the U.S. Census Geocoder Current Benchmark."],
]; return <aside className="prospectus-methodology"><h3>Methodology, sources, and limitations</h3><div className="prospectus-source-grid">{sources.map(([label,body])=><p key={label}><strong>{label}:</strong> {body}</p>)}</div><p><strong>Interpretation:</strong> Terminal mileage is straight-line centroid distance unless explicitly identified as estimated road mileage. Estimated road mileage applies the authored centroid-to-road factor and is not turn-by-turn routing. Unique and PO Box ZIPs are delivery destinations and may not represent residential territory. Population and area-based density are reported only where Census publishes a matching ZCTA. RUCA describes settlement and commuting context and does not independently establish compensation or revenue.</p><p><strong>Disclaimer:</strong> This prospectus is an analytical planning document prepared from third-party reference data, listing information, and user-authored assumptions. It is not a FedEx offer, contractual commitment, revenue guarantee, appraisal, or substitute for legal, tax, accounting, insurance, financing, employment, or investment advice. Listing volumes, mileage, dispatch activity, dates, operating requirements, and compensation may change. Revenue, fleet, labor, fuel, maintenance, insurance, and contribution estimates are scenarios—not forecasts—and should be independently verified before an acquisition, response, financing, staffing, or fleet decision. TeamOptix is not responsible for omissions, source revisions, geocoding variance, or decisions made without independent due diligence.</p></aside>; }
function RailSection({ title, children }: { title: string; children: React.ReactNode }) { return <section style={{ display: "grid", gap: 8 }}><strong style={{ fontSize: 13 }}>{title}</strong>{children}</section>; }
function ControlHelp({ title, children }: { title:string; children:React.ReactNode }) { return <details style={{border:"1px solid #dbe3ef",borderRadius:9,padding:"7px 9px",background:"#f8fafc",fontSize:12}}><summary style={{cursor:"pointer",fontWeight:800,color:"#475569"}}>ⓘ {title}</summary><div className="app-card__body" style={{display:"grid",gap:6,paddingTop:7}}>{children}</div></details>; }
function RailLabel({ children }: { children: React.ReactNode }) { return <span className="context-stat__label">{children}</span>; }
function RailInput({ label, value, onChange, step=1, prefix, suffix }: { label:string; value:number; onChange:(v:number)=>void; step?:number; prefix?:string; suffix?:string }) { return <label><RailLabel>{label}</RailLabel><span style={adornedInput}>{prefix?<span style={adornment}>{prefix}</span>:null}<input aria-label={label} type="text" inputMode="decimal" value={value} data-step={step} onChange={(e)=>onChange(numeric(e.target.value))} style={bareInput}/>{suffix?<span style={adornment}>{suffix}</span>:null}</span></label>; }
function DateInput({label,value,onChange}:{label:string;value:string;onChange:(value:string)=>void}) { return <label><RailLabel>{label}</RailLabel><input type="date" value={value} onChange={(event)=>onChange(event.target.value)} style={inputStyle}/></label>; }
function Kpis({ values }: { values: Array<[string,string|number]> }) { return <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))", gap:8 }}>{values.map(([label,value])=><div className="context-stat" key={label}><span className="context-stat__label">{label}</span><strong>{value}</strong></div>)}</div>; }
function Th({ children }: { children:React.ReactNode }) { return <th style={{textAlign:"left",padding:7,borderBottom:"1px solid #94a3b8",fontSize:12}}>{children}</th>; }
function Td({ children }: { children:React.ReactNode }) { return <td style={{padding:7,borderBottom:"1px solid #e2e8f0",whiteSpace:"nowrap"}}>{children ?? "—"}</td>; }
function Editable({ value,onChange,step=1,decimals=0,prefix,suffix }: { value:number;onChange:(v:number)=>void;step?:number;decimals?:number;prefix?:string;suffix?:string }) { const adjust=(direction:number)=>onChange(Math.max(0,rounded(value+direction*step,decimals))); return <td style={{padding:5,borderBottom:"1px solid #e2e8f0"}}><span style={stepperStyle}><button type="button" aria-label={`Decrease by ${step}`} onClick={()=>adjust(-1)} style={stepButton}>−</button><span style={stepValue}>{prefix}<input type="text" inputMode="decimal" value={formatInput(value,decimals)} onChange={(e)=>onChange(numeric(e.target.value))} style={stepInput}/>{suffix?<small style={stepUnit}>{suffix}</small>:null}</span><button type="button" aria-label={`Increase by ${step}`} onClick={()=>adjust(1)} style={stepButton}>+</button></span></td>; }
function money(value:number) { return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(value); }
function percent(value:number) { return new Intl.NumberFormat("en-US",{style:"percent",maximumFractionDigits:1}).format(value); }
function sum(rows:Array<Record<string,unknown>>, key:string) { return rows.reduce((total,row)=>total+Number(row[key]??0),0); }
function average(rows:Array<Record<string,unknown>>, key:string) { return rows.length ? sum(rows,key)/rows.length : 0; }
function weightedRurality(rows:Array<Record<string,unknown>>) { const population=sum(rows,"population"); return population ? rows.reduce((s,r)=>s+Number(r.rurality_factor??0)*Number(r.population??0),0)/population : 0; }
function format(value:unknown) { return value===null||value===undefined ? "—" : Number(value).toLocaleString(); }
function peakWindow(inputs:Inputs) { if(!inputs.peakStartDate||!inputs.peakEndDate) return "Not set"; return `${new Date(`${inputs.peakStartDate}T00:00:00`).toLocaleDateString()}–${new Date(`${inputs.peakEndDate}T00:00:00`).toLocaleDateString()}`; }
function corePeakDates(year:number) { const thanksgiving=fourthThursday(year,10); const start=new Date(thanksgiving); start.setDate(start.getDate()-((start.getDay()+6)%7)); const christmas=new Date(year,11,25); const end=new Date(christmas); end.setDate(end.getDate()+(7-end.getDay())%7); return {peakStartDate:isoLocal(start),peakEndDate:isoLocal(end)}; }
function fourthThursday(year:number,month:number) { const first=new Date(year,month,1); const firstThursday=1+(4-first.getDay()+7)%7; return new Date(year,month,firstThursday+21); }
function blackFriday(year:number) { const date=fourthThursday(year,10); date.setDate(date.getDate()+1); return date; }
function seasonalRamp(inputs:Inputs,type:"commercial"|"residential") { const year=Number(inputs.peakStartDate.slice(0,4))||new Date().getFullYear(); const date=blackFriday(year); date.setDate(date.getDate()-7*(type==="commercial"?inputs.commercialLeadWeeks:inputs.residentialLeadWeeks)); return date.toLocaleDateString(); }
function isoLocal(date:Date) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`; }
function numeric(value:string) { const parsed=Number(value.replace(/[^0-9.-]/g,"")); return Number.isFinite(parsed)?parsed:0; }
function rounded(value:number,decimals:number) { const scale=10**decimals; return Math.round(value*scale)/scale; }
function formatInput(value:number,decimals:number) { return value.toLocaleString("en-US",{minimumFractionDigits:decimals,maximumFractionDigits:decimals}); }
function rateSuffix(basis:RateBasis) { return basis==="HOUR"?"/hr":basis==="DAY"?"/day":basis==="WEEK"?"/wk":basis==="MONTH"?"/mo":"/yr"; }
function prospectusFilename(opportunity:ScenarioOpportunity|undefined) { const clean=(value:string)=>value.trim().replace(/[^A-Za-z0-9]+/g,"-").replace(/^-|-$/g,""); const fullNumber=clean(opportunity?.opportunity_number??"Unnumbered"); const parts=fullNumber.split("-"); const number=parts.length>=2?`ISP-${parts.slice(-2).join("-")}`:fullNumber; const station=clean(opportunity?.station_name??opportunity?.listing_location??"Opportunity"); const date=new Date().toISOString().slice(0,10); return `${station}_${number}_${date}`; }
const inputStyle = { display:"block", width:"100%", marginTop:5, border:"1px solid #cbd5e1", borderRadius:9, background:"#f8fafc", padding:"9px 10px", color:"#0f172a", fontWeight:700, outline:"none" };
const selectStyle = { ...inputStyle, background:"#fff" };
const adornedInput = { display:"flex", alignItems:"center", width:"100%", marginTop:5, border:"1px solid #cbd5e1", borderRadius:9, background:"#f8fafc", overflow:"hidden" };
const bareInput = { minWidth:0, width:"100%", border:0, background:"transparent", padding:"9px 8px", color:"#0f172a", fontWeight:700, outline:"none" };
const adornment = { padding:"0 9px", color:"#64748b", fontSize:12, fontWeight:800, whiteSpace:"nowrap" as const };
const stepperStyle = { display:"inline-flex",alignItems:"stretch",border:"1px solid #cbd5e1",borderRadius:10,background:"#f8fafc",overflow:"hidden",minHeight:34 };
const stepButton = { width:28,border:0,background:"#eef2f7",color:"#334155",fontWeight:900,cursor:"pointer" };
const stepValue = { display:"flex",alignItems:"center",gap:3,padding:"0 6px",fontWeight:800,color:"#0f172a",whiteSpace:"nowrap" as const };
const stepInput = { width:58,border:0,background:"transparent",outline:"none",fontWeight:800,textAlign:"right" as const,color:"#0f172a" };
const stepUnit = { color:"#64748b",fontSize:10,fontWeight:800 };
const tableSelectStyle = { border:"1px solid #cbd5e1",borderRadius:9,background:"#f8fafc",padding:"8px 9px",fontWeight:700,color:"#0f172a" };
const removeButton = { border:0,background:"transparent",color:"#b91c1c",fontWeight:800,cursor:"pointer",padding:"8px" };
