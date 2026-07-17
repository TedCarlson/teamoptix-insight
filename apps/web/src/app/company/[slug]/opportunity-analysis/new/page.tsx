import {
  OpportunityFoundationNotice,
  OpportunityWorkspaceHeader,
} from "@/features/opportunity-analysis/OpportunityWorkspace";

const inputStyle = { width: "100%", minHeight: 42 };

export default function Page() {
  return (
    <main className="workspace-shell">
      <section className="workspace-main" style={{ display: "grid", gap: 14 }}>
        <OpportunityWorkspaceHeader
          eyebrow="Opportunity Analysis · Intake"
          title="New Analysis"
          description="Create the evidence envelope first. TeamOptix will normalize the listing facts before calculating any planning assumptions."
        />

        <article className="app-card" style={{ padding: 16, display: "grid", gap: 16 }}>
          <div>
            <p className="value-card__eyebrow">1 · Opportunity identity</p>
            <h2 className="app-card__title">Identify the offer</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            <label>Opportunity number<input style={inputStyle} placeholder="ISP-26-07-06-0150-001" /></label>
            <label>Station<input style={inputStyle} placeholder="North Pittsburgh" /></label>
            <label>Opportunity type<input style={inputStyle} placeholder="Pickup and Delivery" /></label>
            <label>Listing location<input style={inputStyle} placeholder="Zelienople, Pennsylvania" /></label>
          </div>
        </article>

        <article className="app-card" style={{ padding: 16, display: "grid", gap: 16 }}>
          <div>
            <p className="value-card__eyebrow">2 · Ship center</p>
            <h2 className="app-card__title">Set the stem origin</h2>
            <p className="app-card__body" style={{ marginTop: 6 }}>The verified ship-center address anchors terminal-to-centroid distance calculations.</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            <label>Street address<input style={inputStyle} /></label>
            <label>City<input style={inputStyle} /></label>
            <label>State<input style={inputStyle} maxLength={2} /></label>
            <label>ZIP Code<input style={inputStyle} inputMode="numeric" maxLength={5} /></label>
          </div>
        </article>

        <article className="app-card" style={{ padding: 16, display: "grid", gap: 12 }}>
          <div>
            <p className="value-card__eyebrow">3 · Listing evidence</p>
            <h2 className="app-card__title">Paste Additional Information</h2>
            <p className="app-card__body" style={{ marginTop: 6 }}>Include the ZIP list, weekly operating averages, dispatch range, and tentative dates.</p>
          </div>
          <textarea rows={15} placeholder="Additional Information&#10;Full Zips: ...&#10;Average weekly mileage: ..." />
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button className="button button-primary" type="button" disabled>Extract and review</button>
          </div>
        </article>

        <OpportunityFoundationNotice>
          Intake is staged for parser and persistence wiring. Extraction will preserve the source block, deduplicate analytical ZIPs, flag special-purpose ZIPs, and produce six- and seven-day assumptions side by side.
        </OpportunityFoundationNotice>
      </section>
    </main>
  );
}
