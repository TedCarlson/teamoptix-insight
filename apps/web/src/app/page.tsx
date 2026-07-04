import FoyerCtaBand from "@/features/foyer/components/FoyerCtaBand";
import FoyerDoorCard from "@/features/foyer/components/FoyerDoorCard";
import FoyerHeader from "@/features/foyer/components/FoyerHeader";
import FoyerProofStrip from "@/features/foyer/components/FoyerProofStrip";

const doors = [
  {
    eyebrow: "Owner path",
    title: "I Own a Company",
    body: "Explore how Insight helps contractors lead with clarity, control, and confidence.",
    href: "/company-owner",
    cta: "Enter",
  },
  {
    eyebrow: "Employee path",
    title: "I Work Here",
    body: "Access the tools and information you need to get the job done.",
    href: "/employee",
    cta: "Employee Entry",
  },
  {
    eyebrow: "Product path",
    title: "Explore Insight",
    body: "See how Insight brings your operation together in one connected platform.",
    href: "/explore",
    cta: "A Day with Insight",
  },
  {
    eyebrow: "Company path",
    title: "About Team Optix",
    body: "Our purpose, our principles, and the operators we build for.",
    href: "/teamoptix",
    cta: "Our Story",
  },
];

export default function HomePage() {
  return (
    <main className="foyer-page">
      <section className="foyer-hero">
        <FoyerHeader />

        <div className="foyer-hero__content">
          <p className="foyer-kicker">Insight is our flagship product.</p>
          <h1>Run the Business.</h1>
          <p className="foyer-lede">
            We respect that a lot goes on between talking about a thing and doing a thing.
            Even more when people are counting on you to do it well.
          </p>
          <p className="foyer-welcome">Welcome to Team Optix.</p>
        </div>
      </section>


      <section className="foyer-insight-is" aria-label="What Insight is">
        <p className="foyer-kicker">Insight is...</p>
        <div className="foyer-insight-is__grid">
          {[
            "Planning",
            "Dispatch",
            "Scheduling",
            "Payroll Support",
            "Compliance",
            "Data Collection",
            "Historical Context",
            "Decision Support",
          ].map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
        <h2>
          Connecting the front line
          <br />
          with the bottom line.
        </h2>
        <p>Operators wear many hats. Insight puts them on one hook.</p>
      </section>

      <section className="foyer-section">
        <h2>How can Insight help you?</h2>
        <div className="foyer-door-grid">
          {doors.map((door) => (
            <FoyerDoorCard key={door.href} {...door} />
          ))}
        </div>
      </section>

      <FoyerProofStrip />

      <section className="foyer-product">
        <div>
          <p className="foyer-kicker">Our flagship product</p>
          <h2>Insight.</h2>
          <p>
            Operations intelligence for contractors who need their business to run better today
            and scale with confidence tomorrow.
          </p>
          <ul>
            <li>Operational clarity across every function</li>
            <li>Real-time visibility into what matters</li>
            <li>Historical context that supports better decisions</li>
            <li>Tools that empower operators and their teams</li>
          </ul>
        </div>

        <aside className="foyer-product__placeholder">
          <span>Insight workspace preview</span>
          <strong>Planning · Dispatch · Payroll · Intelligence</strong>
        </aside>
      </section>

      <FoyerCtaBand />
    </main>
  );
}
