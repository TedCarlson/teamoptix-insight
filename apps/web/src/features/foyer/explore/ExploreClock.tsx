"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { exploreMoments } from "./exploreDay.model";

const STEP_MS = 2000;
const NODE_RADIUS_PERCENT = 38;

function nodePosition(angle: number): CSSProperties {
  const radians = (angle * Math.PI) / 180;

  return {
    "--angle": `${angle}deg`,
    "--node-x": `${50 + Math.sin(radians) * NODE_RADIUS_PERCENT}%`,
    "--node-y": `${50 - Math.cos(radians) * NODE_RADIUS_PERCENT}%`,
  } as CSSProperties;
}

export default function ExploreClock() {
  const [activeIndex, setActiveIndex] = useState(0);

  const safeIndex = useMemo(() => {
    if (exploreMoments.length === 0) return 0;
    return activeIndex % exploreMoments.length;
  }, [activeIndex]);

  const activeMoment = exploreMoments[safeIndex] ?? exploreMoments[0];

  useEffect(() => {
    if (exploreMoments.length === 0) return;

    const interval = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % exploreMoments.length);
    }, STEP_MS);

    return () => window.clearInterval(interval);
  }, []);

  if (!activeMoment) return null;

  return (
    <section className="explore-clock" aria-label="A connected day with Insight">
      <div
        className="explore-clock__orbit"
        style={{ "--hand-angle": `${activeMoment.angle - 90}deg` } as CSSProperties}
      >
        <div className="explore-clock__ring" />
        <div className="explore-clock__hand" />
        <div className="explore-clock__center">
          <Image
            src="/icons/logo-2-insight-cutout.png"
            alt=""
            width={96}
            height={96}
            priority
          />
          <strong>Insight</strong>
          <span>by Team Optix</span>
        </div>

        {exploreMoments.map((moment, index) => (
          <article
            key={moment.title}
            className={`explore-clock__node${
              index === safeIndex ? " explore-clock__node--active" : ""
            }`}
            style={nodePosition(moment.angle)}
          >
            <div className="explore-clock__node-icon" />
            <h3>{moment.title}</h3>
          </article>
        ))}

        <div className="explore-clock__active-label" aria-live="polite">
          <span>Now connecting</span>
          <strong>{activeMoment.title}</strong>
        </div>
      </div>
    </section>
  );
}
