import Link from "next/link";
import FoyerHeader from "@/features/foyer/components/FoyerHeader";
import FoyerWorkspaceRequestCard from "@/features/foyer/components/FoyerWorkspaceRequestCard";

const principles = [
  "Software should explain the business, not hide it.",
  "Operations deserve context, not dashboards alone.",
  "Truth before appearance.",
  "Build for the people doing the work.",
];

export default function TeamOptixAboutPage() {
  return (
    <main className="foyer-page foyer-page--light">
      <FoyerHeader />

      <section className="foyer-detail">
        <p className="foyer-kicker">About Team Optix</p>
        <h1>Built by operators. Built for operators.</h1>
        <p>
          Team Optix is an operational software company building tools for businesses
          that depend on disciplined daily execution.
        </p>
        <p>
          Our flagship product is Insight: a platform created to help contractors see
          the work, understand the risk, and make better decisions without losing the
          human context behind the operation.
        </p>
      </section>

      <section className="foyer-product">
        <div>
          <p className="foyer-kicker">Why we exist</p>
          <h2>Because the work was already hard enough.</h2>
          <p>
            Operations teams live inside reports, schedules, payroll questions,
            service pressure, staffing gaps, and decisions that do not wait for a
            perfect system.
          </p>
          <p>
            Team Optix started from that reality. Insight exists because operators
            need software that respects the pace of the work and helps explain what
            is actually happening.
          </p>
        </div>

        <aside className="foyer-product__placeholder">
          <span>Our philosophy</span>
          <strong>Truth, context, and practical control.</strong>
          <p>
            Not software theater. Not dashboards for their own sake. Tools that help
            people run the business with confidence.
          </p>
        </aside>
      </section>

      <section className="foyer-steps">
        {principles.map((principle) => (
          <article key={principle}>
            <h3>{principle}</h3>
          </article>
        ))}
      </section>

      <section className="foyer-cta">
        <div>
          <p className="foyer-kicker">The vision</p>
          <h2>Insight is the first product. The mission is larger.</h2>
          <p>
            Team Optix is building toward a long-term software company for operators:
            practical systems for businesses where planning, people, service, and
            accountability all have to meet in the same day.
          </p>
        </div>

        <div className="foyer-cta__actions">
          <Link className="button button-primary" href="/company-owner">
            Request an Insight workspace
          </Link>
          <Link className="button" href="/explore">
            Explore Insight
          </Link>
        </div>
      </section>

      <FoyerWorkspaceRequestCard />
    </main>
  );
}
