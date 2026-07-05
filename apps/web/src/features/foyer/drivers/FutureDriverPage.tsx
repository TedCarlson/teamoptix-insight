import Link from "next/link";
import FoyerHeader from "@/features/foyer/components/FoyerHeader";

const comingSoonItems = [
  "Receive a secure invitation from an Insight contractor.",
  "Complete onboarding steps from one connected place.",
  "Track candidate, background, TSA, DOT, and compliance progress.",
  "Prepare for orientation and your first day on the road.",
];

export default function FutureDriverPage() {
  return (
    <main className="foyer-page foyer-page--light">
      <FoyerHeader />

      <section className="foyer-detail">
        <p className="foyer-kicker">Future drivers</p>
        <h1>Drive with an Insight contractor.</h1>
        <p>
          We are building a connected candidate experience that helps contractors
          and future drivers move from interview to onboarding to first day with less friction.
        </p>

        <section className="foyer-product__placeholder" style={{ marginTop: 24 }}>
          <span>Coming soon</span>
          <strong>Candidate onboarding under one roof.</strong>
          <p>
            Insight will help contractors send secure invite links, organize onboarding status,
            and keep candidates informed while required third-party checks are completed.
          </p>
        </section>

        <div className="foyer-door-grid" style={{ marginTop: 24 }}>
          {comingSoonItems.map((item) => (
            <article className="foyer-door-card" key={item}>
              <p className="foyer-kicker">Candidate path</p>
              <h2>{item}</h2>
            </article>
          ))}
        </div>

        <div className="cta-row" style={{ marginTop: 24 }}>
          <Link className="button button-primary" href="/drivers">
            Back to Drivers
          </Link>
          <Link className="button button-secondary" href="/explore">
            Explore Insight
          </Link>
        </div>
      </section>
    </main>
  );
}
