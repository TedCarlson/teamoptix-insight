import FoyerHeader from "@/features/foyer/components/FoyerHeader";
import DriverChoiceCard from "./DriverChoiceCard";

const choices = [
  {
    eyebrow: "Current driver",
    title: "I work for a contractor that uses Insight.",
    body: "See what Insight brings together for your workday: schedule visibility, timekeeping, time off, performance, messages, and compliance.",
    href: "/drivers/current",
    cta: "Continue",
  },
  {
    eyebrow: "Future driver",
    title: "I want to drive for a contractor that uses Insight.",
    body: "A connected hiring and onboarding path is coming soon for candidates invited by Insight contractors.",
    href: "/drivers/future",
    cta: "Preview",
  },
];

export default function DriverChoicePage() {
  return (
    <main className="foyer-page foyer-page--light">
      <FoyerHeader />

      <section className="foyer-detail">
        <p className="foyer-kicker">Drivers</p>
        <h1>Choose your driver experience.</h1>
        <p>
          Insight connects drivers to the same operational truth contractors rely on,
          with each experience shaped around where you are in the journey.
        </p>

        <div className="foyer-door-grid" style={{ marginTop: 24 }}>
          {choices.map((choice) => (
            <DriverChoiceCard key={choice.href} {...choice} />
          ))}
        </div>
      </section>
    </main>
  );
}
