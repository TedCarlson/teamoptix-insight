"use client";

import { useEffect, useRef } from "react";
import { exploreMoments } from "./exploreDay.model";

const ribbon = [
  ...exploreMoments,
  ...exploreMoments,
  ...exploreMoments,
];

export default function ExploreJourneyCards() {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Start in the middle copy.
    el.scrollLeft = el.scrollWidth / 3;

    const handleScroll = () => {
      const third = el.scrollWidth / 3;
      const buffer = el.clientWidth;

      if (el.scrollLeft < buffer) {
        el.scrollLeft += third;
      } else if (el.scrollLeft > third * 2 - buffer) {
        el.scrollLeft -= third;
      }
    };

    el.addEventListener("scroll", handleScroll, { passive: true });

    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <section
      ref={ref}
      className="explore-journey"
      aria-label="Insight daily journey"
    >
      {ribbon.map((moment, index) => (
        <article key={`${index}-${moment.title}`}>
          <h3>{moment.title}</h3>
        </article>
      ))}
    </section>
  );
}
