import Link from "next/link";
import FoyerHeader from "@/features/foyer/components/FoyerHeader";

const comingSoonItems = [
  "Receive a secure invitation from an organization using Insight.",
  "Complete onboarding steps from one connected place.",
  "Follow required screening, qualification, and compliance progress.",
  "Prepare for orientation and your first day with the team.",
];

export default function FutureTeamMemberPage() {
  return (
    <main className="foyer-page foyer-page--light">
      <FoyerHeader />

      <section className="foyer-detail">
        <p className="foyer-kicker">Future team members</p>
        <h1>Join a team using Insight.</h1>
        <p>
          We are building a connected candidate experience that helps
          organizations and future team members move from introduction to
          onboarding to first day with less friction.
        </p>

        <section className="foyer-product__placeholder" style={{ marginTop: 24 }}>
          <span>Coming soon</span>
          <strong>Candidate onboarding under one roof.</strong>
          <p>
            Insight will help organizations send secure invitations, organize
            onboarding progress, and keep candidates informed while required
            reviews and third-party checks are completed.
          </p>
        </section>

        <div className="foyer-door-grid" style={{ marginTop: 24 }}>
          {comingSoonItems.map((item) => (
            <article className="foyer-door-card" key={item}>
              <p className="foyer-kicker">Candidate journey</p>
              <h2>{item}</h2>
            </article>
          ))}
        </div>

        <div className="cta-row" style={{ marginTop: 24 }}>
          <Link className="button button-primary" href="/teams">
            Back to Teams
          </Link>
          <Link className="button button-secondary" href="/explore">
            Explore Insight
          </Link>
        </div>
      </section>
    </main>
  );
}
