"use client";

import Image from "next/image";
import {
  Archive,
  BarChart3,
  CalendarDays,
  ClipboardCheck,
  Route,
  Truck,
  UserRound,
  WalletCards,
  Wrench,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

const STEP_MS = 2400;

const signals = [
  { title: "People", body: "Identity, readiness, responsibility, and the people available to carry the work.", icon: UserRound },
  { title: "Planning", body: "Demand becomes a practical plan with the operating context still attached.", icon: ClipboardCheck },
  { title: "Scheduling", body: "Workforce availability and operational demand resolve into one shared commitment.", icon: CalendarDays },
  { title: "Dispatch", body: "The plan crosses into execution with ownership, timing, and exceptions visible.", icon: Route },
  { title: "Service", body: "Live evidence shows what changed while there is still time to respond well.", icon: Wrench },
  { title: "Assets", body: "Vehicles, equipment, inspections, and maintenance stay connected to the day.", icon: Truck },
  { title: "Payroll", body: "Time and completed work become accountable records instead of a separate reconstruction.", icon: WalletCards },
  { title: "Intelligence", body: "Patterns emerge from governed operating evidence—not a disconnected reporting layer.", icon: BarChart3 },
  { title: "Records", body: "The day closes with history that makes tomorrow easier to understand and run.", icon: Archive },
];

type SignalPosition = CSSProperties & {
  "--signal-angle": string;
  "--signal-x": string;
  "--signal-y": string;
};

// Authored coordinates keep the orbit identical in the server and browser.
// Calculating these with Math.sin/Math.cos during render can differ by a final
// floating-point digit between JavaScript runtimes and trigger hydration noise.
const signalPositions: SignalPosition[] = [
  { "--signal-angle": "0deg", "--signal-x": "50%", "--signal-y": "8%" },
  { "--signal-angle": "40deg", "--signal-x": "76.997096%", "--signal-y": "17.826133%" },
  { "--signal-angle": "80deg", "--signal-x": "91.361925%", "--signal-y": "42.706776%" },
  { "--signal-angle": "120deg", "--signal-x": "86.373067%", "--signal-y": "71%" },
  { "--signal-angle": "160deg", "--signal-x": "64.364846%", "--signal-y": "89.467106%" },
  { "--signal-angle": "200deg", "--signal-x": "35.635154%", "--signal-y": "89.467106%" },
  { "--signal-angle": "240deg", "--signal-x": "13.626933%", "--signal-y": "71%" },
  { "--signal-angle": "280deg", "--signal-x": "8.638075%", "--signal-y": "42.706776%" },
  { "--signal-angle": "320deg", "--signal-x": "23.002904%", "--signal-y": "17.826133%" },
];

export default function InsightLivingSystem() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const active = signals[activeIndex];

  useEffect(() => {
    if (isPaused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const interval = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % signals.length);
    }, STEP_MS);

    return () => window.clearInterval(interval);
  }, [isPaused]);

  return (
    <section className="product-living-system" aria-labelledby="living-system-title">
      <header className="product-living-system__heading">
        <div>
          <p className="brand-eyebrow"><span /> One living operating system</p>
          <h2 id="living-system-title">The operation is alive.<br /><em>Insight keeps it connected.</em></h2>
        </div>
        <p>
          Insight does not hand work from one disconnected tool to the next. It carries context forward as the operation moves.
        </p>
      </header>

      <div
        className="product-living-system__stage"
        ref={stageRef}
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onFocusCapture={() => setIsPaused(true)}
        onBlurCapture={(event) => {
          if (!stageRef.current?.contains(event.relatedTarget as Node | null)) {
            setIsPaused(false);
          }
        }}
      >
        <div className="product-living-system__narrative" aria-live="polite">
          <span>Signal {String(activeIndex + 1).padStart(2, "0")} of {String(signals.length).padStart(2, "0")}</span>
          <h3>{active.title}</h3>
          <p>{active.body}</p>
          <div className="product-living-system__progress" aria-hidden="true">
            {signals.map((signal, index) => (
              <i className={index === activeIndex ? "is-active" : ""} key={signal.title} />
            ))}
          </div>
        </div>

        <div
          className="product-living-system__orbit"
          style={{ "--active-angle": `${(360 / signals.length) * activeIndex - 90}deg` } as CSSProperties}
        >
          <div className="product-living-system__halo" />
          <div className="product-living-system__sweep"><i /></div>
          <div className="product-living-system__core">
            <Image src="/icons/logo-2-insight-cutout.png" alt="" width={112} height={112} />
            <strong>Insight</strong>
            <span>by Team Optix</span>
            <small>Operating context connected</small>
          </div>

          {signals.map(({ title, icon: Icon }, index) => (
            <button
              type="button"
              className={`product-living-system__node${index === activeIndex ? " is-active" : ""}`}
              style={signalPositions[index]}
              onClick={() => setActiveIndex(index)}
              aria-pressed={index === activeIndex}
              key={title}
            >
              <span><Icon aria-hidden="true" /></span>
              <strong>{title}</strong>
            </button>
          ))}
        </div>
      </div>

      <footer>
        <span>Identity</span><i />
        <span>Evidence</span><i />
        <span>Decision</span><i />
        <span>Action</span><i />
        <span>Governed record</span>
      </footer>
    </section>
  );
}
