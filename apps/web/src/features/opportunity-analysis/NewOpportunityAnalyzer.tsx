"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { parseOpportunityListing, type OpportunityListing } from "./parseOpportunityListing";
import { summarizeResidentialTerritory } from "./zipIntelligence";

function display(value: string | number | null) {
  return value === null || value === "" ? "—" : typeof value === "number" ? value.toLocaleString() : value;
}

function Metric({ label, value }: { label: string; value: string | number | null }) {
  return <div className="context-stat"><span className="context-stat__label">{label}</span><strong>{display(value)}</strong></div>;
}

function Scenario({ days, listing }: { days: 6 | 7; listing: OpportunityListing }) {
  const totalStops = (listing.weeklyDeliveryStops ?? 0) + (listing.weeklyPickupStops ?? 0);
  const totalPackages = (listing.weeklyDeliveryPackages ?? 0) + (listing.weeklyPickupPackages ?? 0);
  const daily = (value: number | null) => value === null ? null : Math.round((value / days) * 10) / 10;
  const dispatchMin = daily(listing.weeklyDispatchMin);
  const dispatchMax = daily(listing.weeklyDispatchMax);
  return (
    <article className="app-card" style={{ padding: 16, display: "grid", gap: 10 }}>
      <h3 className="app-card__title">{days}-day operation</h3>
      <Metric label="Daily dispatches" value={dispatchMin === null || dispatchMax === null ? null : `${dispatchMin.toFixed(1)}–${dispatchMax.toFixed(1)}`} />
      <Metric label="Daily miles" value={daily(listing.weeklyMileage)} />
      <Metric label="Daily stops" value={daily(totalStops)} />
      <Metric label="Daily packages" value={daily(totalPackages)} />
    </article>
  );
}

type ZipAnalysisRow = {
  zip_code: string; preferred_city: string; state_code: string; classification: string;
  population: number | null; land_area_sqmi: number | null; population_density_per_sqmi: number | null;
  business_establishments: number | null; business_employment: number | null;
  establishments_per_sqmi: number | null; employees_per_sqmi: number | null;
  ruca_primary_code: number | null; ruca_secondary_code: number | null;
  ruca_category: string | null; rurality_factor: number | null;
  latitude: number | null; longitude: number | null;
  terminal_distance_miles: number; coordinate_source: string; coordinate_method: string;
};

type ZipAnalysis = {
  terminal: { matched_address: string; source: string; status: string; latitude: number; longitude: number };
  rows: ZipAnalysisRow[];
  unresolved_zip_codes: string[];
};

export default function NewOpportunityAnalyzer({ companySlug }: { companySlug: string }) {
  const router = useRouter();
  const [source, setSource] = useState("");
  const [listing, setListing] = useState<OpportunityListing | null>(null);
  const [terminalAddress, setTerminalAddress] = useState("");
  const [zipAnalysis, setZipAnalysis] = useState<ZipAnalysis | null>(null);
  const [zipLoading, setZipLoading] = useState(false);
  const [zipError, setZipError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const totals = useMemo(() => listing ? {
    stops: (listing.weeklyDeliveryStops ?? 0) + (listing.weeklyPickupStops ?? 0),
    packages: (listing.weeklyDeliveryPackages ?? 0) + (listing.weeklyPickupPackages ?? 0),
  } : null, [listing]);
  const territory = useMemo(() => {
    if (!zipAnalysis) return null;
    return summarizeResidentialTerritory(zipAnalysis.rows);
  }, [zipAnalysis]);
  const zipGroups = useMemo(() => {
    const rows = zipAnalysis?.rows ?? [];
    return {
      residential: rows.filter((row) => row.classification === "STANDARD" && row.population !== null),
      special: rows.filter((row) => row.classification === "UNIQUE" || row.classification === "PO_BOX"),
      exceptions: rows.filter((row) => row.classification === "STANDARD" && row.population === null),
    };
  }, [zipAnalysis]);

  async function analyzeZips() {
    if (!listing || !terminalAddress.trim()) return;
    setZipLoading(true); setZipError(""); setZipAnalysis(null);
    try {
      const response = await fetch(`/api/company/${companySlug}/opportunity-analysis/zip-analysis`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ terminal_address: terminalAddress, zip_codes: listing.uniqueZips }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "ZIP analysis failed.");
      setZipAnalysis(data);
    } catch (error) {
      setZipError(error instanceof Error ? error.message : "ZIP analysis failed.");
    } finally { setZipLoading(false); }
  }

  async function saveOpportunity() {
    if (!listing || !zipAnalysis) return;
    setSaving(true); setSaveError("");
    try {
      const response = await fetch(`/api/company/${companySlug}/opportunity-analysis/opportunities`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          opportunity_number: listing.opportunityNumber,
          station_name: listing.station,
          opportunity_type: listing.opportunityType,
          listing_location: listing.location,
          source_text: source,
          terminal_address: terminalAddress,
          zip_codes: listing.uniqueZips,
          weekly_mileage: listing.weeklyMileage,
          weekly_delivery_stops: listing.weeklyDeliveryStops,
          weekly_delivery_packages: listing.weeklyDeliveryPackages,
          weekly_pickup_stops: listing.weeklyPickupStops,
          weekly_pickup_packages: listing.weeklyPickupPackages,
          weekly_dispatch_min: listing.weeklyDispatchMin,
          weekly_dispatch_max: listing.weeklyDispatchMax,
          negotiation_start_date: listing.negotiationStartDate,
          contract_start_date: listing.contractStartDate,
          parsed_listing: listing,
          zip_analysis: zipAnalysis,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data?.id) throw new Error(data?.error ?? "Save failed.");
      router.push(`/company/${companySlug}/opportunity-analysis/${data.id}`);
      router.refresh();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Save failed.");
      setSaving(false);
    }
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <header style={{ display: "grid", gap: 4 }}>
        <h1 style={{ margin: 0 }}>New Opportunity</h1>
        <p className="app-card__body" style={{ margin: 0 }}>Paste the listing block from the station heading through the tentative contract start date.</p>
      </header>
      <article className="app-card" style={{ padding: 16, display: "grid", gap: 10 }}>
        <label htmlFor="opportunity-listing"><strong>Listing</strong></label>
        <textarea id="opportunity-listing" rows={22} value={source} onChange={(event) => { setSource(event.target.value); setListing(null); }} placeholder="Station ... - Contracted Service Area" />
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="button button-primary" type="button" disabled={!source.trim()} onClick={() => setListing(parseOpportunityListing(source))}>Analyze listing</button>
        </div>
      </article>

      {listing ? <>
        <article className="app-card" style={{ padding: 16, display: "grid", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div><p className="value-card__eyebrow">{listing.opportunityNumber ?? "Unnumbered opportunity"}</p><h2 className="app-card__title">{listing.station ?? "Station not found"}</h2></div>
            <span className="pill">{listing.opportunityType}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 8 }}>
            <Metric label="Location" value={listing.location} />
            <Metric label="Unique ZIPs" value={listing.uniqueZips.length} />
            <Metric label="Weekly miles" value={listing.weeklyMileage} />
            <Metric label="Weekly stops" value={totals?.stops ?? null} />
            <Metric label="Weekly packages" value={totals?.packages ?? null} />
            <Metric label="Weekly dispatches" value={listing.weeklyDispatchMin === null || listing.weeklyDispatchMax === null ? null : `${listing.weeklyDispatchMin}–${listing.weeklyDispatchMax}`} />
          </div>
        </article>

        <article className="app-card" style={{ padding: 16, display: "grid", gap: 8 }}>
          <label htmlFor="terminal-address"><strong>Terminal address</strong></label>
          <input id="terminal-address" value={terminalAddress} onChange={(event) => { setTerminalAddress(event.target.value); setZipAnalysis(null); }} placeholder="300 Tomlinson Dr, Zelienople, PA 16063" />
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <small className="app-card__body">Presumed terminal address for analysis.</small>
            <button className="button" type="button" disabled={!terminalAddress.trim() || zipLoading} onClick={analyzeZips}>{zipLoading ? "Calculating…" : "Calculate ZIP analysis"}</button>
          </div>
          {zipError ? <p style={{ color: "#b91c1c", margin: 0 }}>{zipError}</p> : null}
        </article>

        {listing.warnings.length ? <article className="app-card" style={{ padding: 16 }}><strong>Review</strong><ul>{listing.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></article> : null}

        <section style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
          <Scenario days={6} listing={listing} />
          <Scenario days={7} listing={listing} />
        </section>

        {zipAnalysis ? <article className="app-card" style={{ padding: 16, display: "grid", gap: 12, overflowX: "auto" }}>
          <div><strong>ZIP demographics and distance</strong><p className="app-card__body" style={{ margin: "4px 0 0" }}>{zipAnalysis.terminal.matched_address} · Presumed · {zipAnalysis.terminal.source}</p></div>
          <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
            <Metric label="Residential population" value={territory?.population ?? null} />
            <Metric label="Residential people / sq mi" value={territory?.residentialDensity === null || territory?.residentialDensity === undefined ? null : Math.round(territory.residentialDensity * 100) / 100} />
            <Metric label="Business establishments" value={territory?.establishments ?? null} />
            <Metric label="Reported employment" value={territory?.employment ?? null} />
            <Metric label="Rurality factor" value={territory?.ruralityFactor === null || territory?.ruralityFactor === undefined ? null : territory.ruralityFactor.toFixed(2)} />
            <Metric label="RUCA coverage" value={territory ? `${territory.ruralityCoverage} ZIPs` : null} />
          </section>
          <div><strong>Rurality</strong><p className="app-card__body" style={{ margin: "4px 0 0" }}>Population-weighted operating context from USDA RUCA. This factor describes territory; it does not apply a payout or revenue uplift.</p></div>
          <div><strong>Residential and mappable ZIPs</strong><p className="app-card__body" style={{ margin: "4px 0 0" }}>Primary territory rows with Census population and area coverage.</p></div>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
            <thead><tr>{["ZIP", "City", "Type", "RUCA", "Rurality", "Population", "People / sq mi", "Establishments", "Estab / sq mi", "Employees / sq mi", "Terminal miles", "Centroid"].map((label) => <th key={label} style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #cbd5e1" }}>{label}</th>)}</tr></thead>
            <tbody>{zipGroups.residential.map((row) => <tr key={row.zip_code}>
              <td style={{ padding: 8, borderBottom: "1px solid #e2e8f0", fontWeight: 800 }}>{row.zip_code}</td>
              <td style={{ padding: 8, borderBottom: "1px solid #e2e8f0" }}>{row.preferred_city}, {row.state_code}</td>
              <td style={{ padding: 8, borderBottom: "1px solid #e2e8f0" }}>{row.classification.replaceAll("_", " ")}</td>
              <td style={{ padding: 8, borderBottom: "1px solid #e2e8f0" }}>{row.ruca_category?.replaceAll("_", " ") ?? "Unknown"} {row.ruca_primary_code ? `(${row.ruca_primary_code})` : ""}</td>
              <td style={{ padding: 8, borderBottom: "1px solid #e2e8f0" }}>{row.rurality_factor === null ? "N/A" : Number(row.rurality_factor).toFixed(2)}</td>
              <td style={{ padding: 8, borderBottom: "1px solid #e2e8f0" }}>{row.population?.toLocaleString() ?? "N/A"}</td>
              <td style={{ padding: 8, borderBottom: "1px solid #e2e8f0" }}>{row.population_density_per_sqmi?.toLocaleString() ?? "N/A"}</td>
              <td style={{ padding: 8, borderBottom: "1px solid #e2e8f0" }}>{row.business_establishments?.toLocaleString() ?? "N/A"}</td>
              <td style={{ padding: 8, borderBottom: "1px solid #e2e8f0" }}>{row.establishments_per_sqmi?.toLocaleString() ?? "N/A"}</td>
              <td style={{ padding: 8, borderBottom: "1px solid #e2e8f0" }}>{row.employees_per_sqmi?.toLocaleString() ?? "N/A"}</td>
              <td style={{ padding: 8, borderBottom: "1px solid #e2e8f0" }}>{Number(row.terminal_distance_miles).toFixed(1)}</td>
              <td style={{ padding: 8, borderBottom: "1px solid #e2e8f0" }}>{row.coordinate_source}</td>
            </tr>)}</tbody>
          </table>

          {zipGroups.special.length ? <details style={{ border: "1px solid #d7e2ee", borderRadius: 12, padding: 12 }}>
            <summary style={{ cursor: "pointer", fontWeight: 800 }}>Special-purpose ZIPs ({zipGroups.special.length})</summary>
            <p className="app-card__body">Unique and PO Box ZIPs are destinations, not residential territory. Area-based population and density do not apply unless Census publishes a matching ZCTA.</p>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
              <thead><tr>{["ZIP", "City", "Type", "RUCA context", "Known establishments", "Reported employment", "Terminal miles", "Location confidence"].map((label) => <th key={label} style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #cbd5e1" }}>{label}</th>)}</tr></thead>
              <tbody>{zipGroups.special.map((row) => <tr key={row.zip_code}>
                <td style={{ padding: 8, borderBottom: "1px solid #e2e8f0", fontWeight: 800 }}>{row.zip_code}</td>
                <td style={{ padding: 8, borderBottom: "1px solid #e2e8f0" }}>{row.preferred_city}, {row.state_code}</td>
                <td style={{ padding: 8, borderBottom: "1px solid #e2e8f0" }}>{row.classification.replaceAll("_", " ")}</td>
                <td style={{ padding: 8, borderBottom: "1px solid #e2e8f0" }}>{row.ruca_category?.replaceAll("_", " ") ?? "Unknown"}</td>
                <td style={{ padding: 8, borderBottom: "1px solid #e2e8f0" }}>{row.business_establishments?.toLocaleString() ?? "Unknown"}</td>
                <td style={{ padding: 8, borderBottom: "1px solid #e2e8f0" }}>{row.business_employment?.toLocaleString() ?? "Unknown"}</td>
                <td style={{ padding: 8, borderBottom: "1px solid #e2e8f0" }}>{Number(row.terminal_distance_miles).toFixed(1)}</td>
                <td style={{ padding: 8, borderBottom: "1px solid #e2e8f0" }}>Approximate vendor centroid</td>
              </tr>)}</tbody>
            </table>
          </details> : null}

          {zipGroups.exceptions.length || zipAnalysis.unresolved_zip_codes.length ? <details open style={{ border: "1px solid #f3c78b", borderRadius: 12, padding: 12 }}>
            <summary style={{ cursor: "pointer", fontWeight: 800, color: "#92400e" }}>Coverage exceptions ({zipGroups.exceptions.length + zipAnalysis.unresolved_zip_codes.length})</summary>
            {zipGroups.exceptions.map((row) => <p key={row.zip_code} style={{ margin: "8px 0 0" }}><strong>{row.zip_code}</strong> · Standard ZIP without Census ZCTA demographics · approximate terminal distance {Number(row.terminal_distance_miles).toFixed(1)} miles</p>)}
            {zipAnalysis.unresolved_zip_codes.map((zipCode) => <p key={zipCode} style={{ margin: "8px 0 0" }}><strong>{zipCode}</strong> · ZIP not found in the reference database</p>)}
          </details> : null}
          <small className="app-card__body">Terminal miles are straight-line distance to the ZIP centroid, not driving miles. Residential density uses ACS population. Commercial density uses Census business establishments and employment. Rurality uses USDA ERS 2020 RUCA ZIP codes; TeamOptix maps metro, micropolitan, small-town, and rural classes to a 0.00–1.00 operating continuum. Area-based density is shown only where a Census ZCTA exists.</small>
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            {saveError ? <span style={{ color: "#b91c1c" }}>{saveError}</span> : null}
            <button className="button button-primary" type="button" disabled={saving} onClick={saveOpportunity}>{saving ? "Saving…" : "Save opportunity"}</button>
          </div>
        </article> : <article className="app-card" style={{ padding: 16, display: "grid", gap: 8 }}><strong>ZIP Codes</strong><p style={{ margin: 0, lineHeight: 1.7 }}>{listing.uniqueZips.join(", ") || "No ZIP Codes found."}</p></article>}
      </> : null}
    </section>
  );
}
