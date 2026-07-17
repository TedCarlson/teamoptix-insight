export default function Page() {
  const sources = [
    ["ZIP identity and classification", "Canonical ZIP, preferred city, state, and standard/unique/PO Box classification.", "ZIP Codes database · current imported reference"],
    ["Population-weighted centroids", "Representative coordinate used for straight-line terminal-to-territory distance.", "HUD ZIP Code Population Weighted Centroids"],
    ["Residential density", "ACS population divided by Census ZCTA land area where a matching area geography exists.", "U.S. Census ACS 2024 + Gazetteer 2024"],
    ["Commercial density", "Paid-employee establishments and employment associated with each ZIP.", "U.S. Census ZIP Code Business Patterns 2023"],
    ["Rurality", "USDA commuting-area classification mapped to a TeamOptix 0.00–1.00 operating continuum.", "USDA ERS RUCA 2020 ZIP release"],
    ["Terminal location", "A submitted ship-center address resolved to coordinates for analytical use.", "U.S. Census Geocoder · Current Benchmark"],
  ];
  return <main className="workspace-shell"><section className="workspace-main" style={{ display: "grid", gap: 14 }}>
    <header><p className="value-card__eyebrow">Opportunity Analysis · Evidence</p><h1 style={{ margin: 0 }}>Reference Data</h1><p className="app-card__body">What the opportunity report is based on, how each measure is produced, and where its limitations begin.</p></header>
    <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12 }}>
      {sources.map(([title, body, source]) => <article className="app-card" style={{ padding: 16, display: "grid", gap: 8 }} key={title}><h2 className="app-card__title">{title}</h2><p className="app-card__body" style={{ margin: 0 }}>{body}</p><small><strong>Source:</strong> {source}</small></article>)}
    </section>
    <article className="app-card" style={{ padding: 16, display: "grid", gap: 8 }}><h2 className="app-card__title">Interpretation rules</h2><ul style={{ margin: 0, lineHeight: 1.7 }}><li>Terminal miles are straight-line centroid distance, not road miles.</li><li>Unique and PO Box ZIPs are destinations and do not necessarily describe residential territory.</li><li>Density is shown only where Census publishes a matching ZCTA area.</li><li>RUCA describes settlement and commuting context; it does not automatically change revenue.</li><li>Scenario assumptions are authored inputs and remain separate from listing facts and external evidence.</li><li>Saved opportunity reports preserve the evidence snapshot used at the time of analysis.</li></ul></article>
  </section></main>;
}
