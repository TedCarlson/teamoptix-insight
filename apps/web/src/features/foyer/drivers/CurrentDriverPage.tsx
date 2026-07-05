import Link from "next/link";
import FoyerHeader from "@/features/foyer/components/FoyerHeader";

const driverCards = [
  {
    title: "Know your schedule",
    body: "See upcoming work, route assignments, days off, and changes before they become a surprise.",
  },
  {
    title: "Clock in & out",
    body: "Start and finish your workday from Insight while building a clear record of time and activity.",
  },
  {
    title: "Request time off",
    body: "Submit time off requests from the same platform your company uses to plan coverage.",
  },
  {
    title: "Track your performance",
    body: "Review KPIs, scorecards, and trends through a driver-focused view of the same operational truth.",
  },
  {
    title: "Stay informed",
    body: "See company notifications, announcements, and operational messages on your message board.",
  },
  {
    title: "Stay compliant",
    body: "Know when licenses, DOT cards, qualifications, and other documents need attention before they affect your ability to work.",
  },
];

export default function CurrentDriverPage() {
  return (
    <main className="foyer-page foyer-page--light">
      <FoyerHeader />

      <section className="foyer-detail">
        <p className="foyer-kicker">Current drivers</p>
        <h1>Your workday, connected.</h1>
        <p>
          Insight helps drivers see the parts of the operation that shape their day:
          schedules, assignments, timekeeping, time off, performance, messages, and compliance.
        </p>

        <div className="foyer-door-grid" style={{ marginTop: 24 }}>
          {driverCards.map((card) => (
            <article className="foyer-door-card" key={card.title}>
              <p className="foyer-kicker">Driver experience</p>
              <h2>{card.title}</h2>
              <p>{card.body}</p>
            </article>
          ))}
        </div>

        <div className="cta-row" style={{ marginTop: 24 }}>
          <Link className="button button-primary" href="/sign-in">
            Sign In
          </Link>
          <Link className="button button-secondary" href="/drivers">
            Back to Drivers
          </Link>
        </div>
      </section>
    </main>
  );
}
