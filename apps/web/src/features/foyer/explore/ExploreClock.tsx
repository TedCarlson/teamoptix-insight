"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { exploreMoments } from "./exploreDay.model";

const STEP_MS = 2000;

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
            style={{ "--angle": `${moment.angle}deg` } as CSSProperties}
          >
            <div className="explore-clock__node-icon" />
            <h3>{moment.title}</h3>
          </article>
        ))}
      </div>
    </section>
  );
}
