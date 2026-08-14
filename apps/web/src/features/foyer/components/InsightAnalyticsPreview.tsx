import Image from "next/image";

const workspaceAreas = ["Home", "Admin", "Operations", "People", "Schedule", "Fleet", "Routes"];
const intelligenceAreas = ["Dashboard", "Operations", "Workforce", "Peak Planning", "Route Intelligence"];
const demand = [58, 62, 55, 64, 59, 68, 72, 61, 78, 83, 76, 66, 72, 69, 74, 79, 73, 81];
const volume = [43, 47, 42, 51, 46, 54, 58, 49, 62, 70, 64, 53, 59, 55, 61, 66, 58, 68];

export default function InsightAnalyticsPreview() {
  return (
    <div className="insight-product-preview insight-analytics-preview">
      <div className="insight-product-preview__chrome">
        <div className="insight-product-preview__brand">
          <Image src="/icons/logo-2-insight-cutout-xsm.png" alt="" width={70} height={46} />
          <div><strong>Insight</strong><small>by Team Optix</small></div>
        </div>
        <div className="insight-product-preview__identity">
          <span>My Workspace</span>
          <i>OP</i>
          <div><strong>Demo operator</strong><small>Workspace owner</small></div>
        </div>
      </div>

      <nav className="insight-product-preview__primary" aria-label="Representative Insight workspace navigation">
        {workspaceAreas.map((area) => <span className={area === "Admin" ? "is-active" : ""} key={area}>{area}</span>)}
      </nav>
      <nav className="insight-product-preview__secondary" aria-label="Representative operating intelligence navigation">
        {intelligenceAreas.map((area) => <span className={area === "Dashboard" ? "is-active" : ""} key={area}>{area}</span>)}
      </nav>

      <section className="insight-product-preview__workspace insight-analytics-preview__workspace">
        <div className="insight-product-preview__heading">
          <div>
            <p>Operating intelligence</p>
            <h2>Contract-year operating story</h2>
          </div>
          <small><i /> Representative view · demonstration data</small>
        </div>

        <div className="insight-analytics-preview__summary">
          <div><small>Contract year</small><strong>2026</strong></div>
          <p>Demand, deployed capacity, and operating health in one connected view.</p>
          <span>Current through today</span>
        </div>

        <div className="insight-analytics-preview__chart-card">
          <header>
            <div><small>Demand and deployed capacity</small><strong>Operating relationship</strong></div>
            <div><span>Stops</span><span>Packages</span><span>Routes</span></div>
          </header>
          <div className="insight-analytics-preview__chart" aria-label="Representative operating relationship chart">
            <div className="insight-analytics-preview__season insight-analytics-preview__season--ramp">Demand ramp</div>
            <div className="insight-analytics-preview__season insight-analytics-preview__season--peak">Peak season</div>
            <div className="insight-analytics-preview__bars">
              {demand.map((height, index) => (
                <div className="insight-analytics-preview__bar" key={`${height}-${index}`}>
                  <i style={{ height: `${height}%` }} />
                  <b style={{ height: `${volume[index]}%` }} />
                  <span>{19 + (index % 5)}</span>
                </div>
              ))}
            </div>
            <footer><span>Aug</span><span>Nov</span><span>Feb</span><span>May</span><span>Aug</span></footer>
          </div>
        </div>
      </section>
    </div>
  );
}
