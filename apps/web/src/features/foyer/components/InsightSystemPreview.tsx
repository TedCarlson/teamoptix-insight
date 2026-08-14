"use client";

import Image from "next/image";
import { useState } from "react";

type PreviewTheme = "light" | "dark";

const workspaceAreas = ["Home", "Admin", "Operations", "People", "Schedule", "Fleet", "Routes"];
const operationAreas = ["Dispatch", "Service", "Planning", "Ops Reports", "Walk Ons"];

const routeUnits = [
  { route: "North 01 · 430", status: "Arrived", person: "Route lead", stops: "0/66", packages: "0/88", pickups: "0/0", tone: "ready" },
  { route: "North 02 · 477", status: "Arrived", person: "Route lead", stops: "0/68", packages: "0/117", pickups: "0/4", tone: "ready" },
  { route: "North 03 · 426", status: "Arrived", person: "Route lead", stops: "0/85", packages: "0/117", pickups: "0/3", tone: "ready" },
  { route: "North 04 · 434", status: "On job", person: "Route lead", stops: "24/108", packages: "27/131", pickups: "0/0", tone: "active" },
  { route: "North 05 · 436", status: "On job", person: "Route lead", stops: "2/104", packages: "11/160", pickups: "0/0", tone: "active" },
  { route: "North 06 · 445", status: "On job", person: "Route lead · Helper", stops: "22/89", packages: "27/129", pickups: "0/0", tone: "active" },
];

export default function InsightSystemPreview({ compact = false }: { compact?: boolean }) {
  const [previewTheme, setPreviewTheme] = useState<PreviewTheme>("light");

  return (
    <div
      className={`insight-product-preview${compact ? " insight-product-preview--compact" : ""}`}
      data-preview-theme={previewTheme}
    >
      <div className="insight-product-preview__chrome">
        <div className="insight-product-preview__brand">
          <Image
            src="/icons/logo-2-insight-cutout-xsm.png"
            alt=""
            width={70}
            height={46}
          />
          <div><strong>Insight</strong><small>by Team Optix</small></div>
        </div>
        <div className="insight-product-preview__controls">
          <div className="insight-product-preview__theme-switch" aria-label="Preview appearance">
            {(["light", "dark"] as const).map((theme) => (
              <button
                key={theme}
                type="button"
                aria-pressed={previewTheme === theme}
                onClick={() => setPreviewTheme(theme)}
              >
                {theme === "light" ? "Light" : "Dark"}
              </button>
            ))}
          </div>
          <div className="insight-product-preview__identity">
            <span>My Workspace</span>
            <i>OP</i>
            <div><strong>Demo operator</strong><small>Workspace owner</small></div>
          </div>
        </div>
      </div>

      <nav className="insight-product-preview__primary" aria-label="Representative Insight workspace navigation">
        {workspaceAreas.map((area) => <span className={area === "Operations" ? "is-active" : ""} key={area}>{area}</span>)}
      </nav>
      <nav className="insight-product-preview__secondary" aria-label="Representative Operations navigation">
        {operationAreas.map((area) => <span key={area}>{area}</span>)}
      </nav>

      <section className="insight-product-preview__workspace">
        <div className="insight-product-preview__heading">
          <div>
            <p>Current Insight operations workspace</p>
            <h2>Operations</h2>
          </div>
          <small><i /> Representative view · demonstration data</small>
        </div>

        <div className="insight-product-preview__toolbar">
          <span className="is-status"><i /> Status</span>
          <div>
            <span className="is-action">Actions</span>
            <span>Compliance Report</span>
            <span>Express Report</span>
            <span>Attendance</span>
            <span>Refresh</span>
            <span className="is-upload">Upload Report</span>
          </div>
        </div>

        <div className="insight-product-preview__collection">
          <header>21 routes · Today</header>
          <div className="insight-product-preview__filters">
            <span className="is-active">All <strong>21</strong></span>
            <span>Arrived <strong>5</strong></span>
            <span>On Job <strong>16</strong></span>
          </div>
          <div className="insight-product-preview__grid">
            {routeUnits.map((unit) => (
              <article key={unit.route} data-tone={unit.tone}>
                <div><strong>{unit.route}</strong><span><i /> {unit.status}</span></div>
                <p>{unit.person}</p>
                <dl>
                  <div><dt>{unit.stops}</dt><dd>Stops</dd></div>
                  <div><dt>{unit.packages}</dt><dd>Packages</dd></div>
                  <div><dt>{unit.pickups}</dt><dd>PU</dd></div>
                </dl>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
