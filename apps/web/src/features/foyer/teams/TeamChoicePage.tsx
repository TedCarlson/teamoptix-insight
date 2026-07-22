import FoyerHeader from "@/features/foyer/components/FoyerHeader";
import TeamChoiceCard from "./TeamChoiceCard";

const choices = [
  {
    eyebrow: "Current team member",
    title: "I am part of a team currently using Insight.",
    body: "See what Insight brings together for your workday: schedules, timekeeping, time off, performance, communication, and compliance.",
    href: "/teams/current",
    cta: "Continue",
  },
  {
    eyebrow: "Future team member",
    title: "I want to join a team that uses Insight.",
    body: "Preview the connected hiring and onboarding experience being developed for people invited to join organizations using Insight.",
    href: "/teams/future",
    cta: "Preview",
  },
];

export default function TeamChoicePage() {
  return (
    <main className="foyer-page foyer-page--light">
      <FoyerHeader />

      <section className="foyer-detail">
        <p className="foyer-kicker">Teams</p>
        <h1>Choose your team experience.</h1>
        <p>
          Insight connects team members to the same operational truth their
          organization relies on, with each experience shaped around where they
          are in their journey.
        </p>

        <div className="foyer-door-grid" style={{ marginTop: 24 }}>
          {choices.map((choice) => (
            <TeamChoiceCard key={choice.href} {...choice} />
          ))}
        </div>
      </section>
    </main>
  );
}
