"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useLob } from "@/features/lob/hooks/useLob";

export default function CompanyActivityPage() {
  const params = useParams();
  const slug = String(params?.slug ?? "");
  const lob = useLob();

  return (
    <main className="workspace-shell">

      <section className="hero">
        <div className="hero__grid">
          <section className="hero-card hero-card--primary">
            <p className="eyebrow">Activity</p>
            <h1>Activity / Routes / Planning</h1>
            <p className="lede">
              This surface will own routes, planning, schedules, assignments,
              and the operational work the company performs.
            </p>

            <div className="cta-row">
              <Link className="button" href={`/company/${slug}`}>
                Back to company
              </Link>
            </div>
          </section>

          <aside className="hero-card hero-card--secondary">
            <p className="eyebrow">Shell context</p>

            <div className="hero-stat">
              <span className="hero-stat__label">LOB</span>
              <strong>{lob.lob_label}</strong>
            </div>

            <div className="hero-stat">
              <span className="hero-stat__label">Industry</span>
              <strong>{lob.industry_label}</strong>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}