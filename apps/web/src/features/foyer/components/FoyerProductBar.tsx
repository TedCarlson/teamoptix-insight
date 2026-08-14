"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function FoyerProductBar() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const hero = document.getElementById("foyer-hero");

    if (!hero) {
      return;
    }

    const updateFromPosition = () => {
      const heroBounds = hero.getBoundingClientRect();
      setIsVisible(heroBounds.bottom <= 0);
    };

    updateFromPosition();

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(!entry.isIntersecting && entry.boundingClientRect.bottom <= 0);
      },
      {
        threshold: 0,
      },
    );

    observer.observe(hero);

    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <div
      className={`foyer-product-bar${isVisible ? " is-visible" : ""}`}
      aria-hidden={!isVisible}
    >
      <div className="foyer-product-bar__inner">
        <Link
          className="foyer-product-bar__brand"
          href="/#foyer-hero"
          aria-label="Insight by Team Optix — return to the top"
          tabIndex={isVisible ? 0 : -1}
        >
          <Image
            src="/icons/logo-2-insight-cutout.png"
            alt=""
            width={48}
            height={48}
          />

          <span className="foyer-product-bar__lockup">
            <strong>Insight</strong>
            <small>by Team Optix</small>
          </span>
        </Link>

        <span className="foyer-product-bar__promise">
          Built for Operators. By Operators.
        </span>

        <nav
          className="foyer-product-bar__nav"
          aria-label="Insight product navigation"
        >
          <Link href="/insight" tabIndex={isVisible ? 0 : -1}>
            Insight
          </Link>
          <Link href="/company-owner" tabIndex={isVisible ? 0 : -1}>
            Operators
          </Link>
          <Link href="/teams" tabIndex={isVisible ? 0 : -1}>
            Teams
          </Link>
          <Link href="/company" tabIndex={isVisible ? 0 : -1}>
            Company
          </Link>
        </nav>

        <Link
          className="foyer-product-bar__signin"
          href="/sign-in"
          tabIndex={isVisible ? 0 : -1}
        >
          Sign In
        </Link>
      </div>
    </div>
  );
}
