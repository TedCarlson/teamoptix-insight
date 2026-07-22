import Link from "next/link";
import FoyerHeader from "@/features/foyer/components/FoyerHeader";

const teamCards = [
  {
    title: "Know your schedule",
    body: "See upcoming work, assignments, days off, and changes before they become a surprise.",
  },
  {
    title: "Track your workday",
    body: "Start and finish your workday through Insight while building a clear record of time and activity.",
  },
  {
    title: "Request time off",
    body: "Submit time-off requests through the same platform your organization uses to plan coverage.",
  },
  {
    title: "Understand your performance",
    body: "Review performance measures, scorecards, and trends through a view shaped around your role.",
  },
  {
    title: "Stay informed",
    body: "See organizational announcements, operational updates, and messages connected to your work.",
  },
  {
    title: "Stay ready",
    body: "Know when qualifications, licenses, certifications, and other required records need attention.",
  },
];

export default function CurrentTeamMemberPage() {
  return (
    <main className="foyer-page foyer-page--light">
      <FoyerHeader />

      <section className="foyer-detail">
        <p className="foyer-kicker">Current team members</p>
        <h1>Your workday, connected.</h1>
        <p>
          Insight helps team members see the parts of the operation that shape
          their day: schedules, assignments, timekeeping, time off, performance,
          communication, and readiness.
        </p>

        <div className="foyer-door-grid" style={{ marginTop: 24 }}>
          {teamCards.map((card) => (
            <article className="foyer-door-card" key={card.title}>
              <p className="foyer-kicker">Team experience</p>
              <h2>{card.title}</h2>
              <p>{card.body}</p>
            </article>
          ))}
        </div>

        <div className="cta-row" style={{ marginTop: 24 }}>
          <Link className="button button-primary" href="/sign-in">
            Sign In
          </Link>
          <Link className="button button-secondary" href="/teams">
            Back to Teams
          </Link>
        </div>
      </section>
    </main>
  );
}
