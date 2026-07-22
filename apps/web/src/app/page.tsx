import Image from "next/image";
import FoyerDoorCard from "@/features/foyer/components/FoyerDoorCard";
import FoyerHeader from "@/features/foyer/components/FoyerHeader";
import FoyerProductBar from "@/features/foyer/components/FoyerProductBar";
import FoyerProofStrip from "@/features/foyer/components/FoyerProofStrip";
import FoyerWorkspaceRequestCard from "@/features/foyer/components/FoyerWorkspaceRequestCard";

const operationalModules = [
  {
    eyebrow: "Proven operational module",
    title: "FedEx Pickup & Delivery",
    body: "Insight was first developed alongside pickup and delivery operators managing routes, people, service, planning, and daily execution.",
    status: "Available",
  },
  {
    eyebrow: "Emerging operational module",
    title: "Utility Locate",
    body: "A natural extension for organizations managing locate tickets, technicians, response obligations, reporting, and field accountability.",
    status: "In discovery",
  },
  {
    eyebrow: "Emerging operational module",
    title: "Communications",
    body: "Operational support for contractors coordinating technicians, work orders, service activity, assets, and customer commitments.",
    status: "In discovery",
  },
];

const doors = [
  {
    eyebrow: "Operator experience",
    title: "For Operators",
    body: "See how Insight helps operational leaders manage people, work, assets, and intelligence with greater clarity.",
    href: "/company-owner",
    cta: "Operator Experience",
  },
  {
    eyebrow: "Workforce experience",
    title: "For Teams",
    body: "Explore the connected experience for schedules, time off, performance, communication, and daily work.",
    href: "/teams",
    cta: "Team Experience",
  },
  {
    eyebrow: "Platform experience",
    title: "Explore Insight",
    body: "Follow a day inside the platform and see how operational functions come together in one system.",
    href: "/explore",
    cta: "A Day with Insight",
  },
  {
    eyebrow: "Company story",
    title: "About Team Optix",
    body: "Learn why we build for operators, how Insight began, and where the platform is going next.",
    href: "/teamoptix",
    cta: "Our Story",
  },
];

export default function HomePage() {
  return (
    <main className="foyer-page">
      <section id="foyer-hero" className="foyer-hero">
        <FoyerHeader />

        <div className="foyer-hero__content">
          <div className="foyer-product-lockup">
            <Image
              src="/icons/logo-2-insight-cutout.png"
              alt="Insight"
              width={188}
              height={188}
              priority
            />
            <div className="foyer-product-lockup__text">
              <strong>Insight</strong>
              <span>by Team Optix</span>
            </div>
          </div>

          <div className="foyer-product-lockup__rule" />

          <h1>Run the Business.</h1>
          <p className="foyer-welcome">
            Built for Operators. By Operators.
          </p>
          <p className="foyer-hero__lede">
            Team Optix builds operational software for organizations responsible for
            people, work, assets, and real-world execution.
          </p>
        </div>
      </section>

      <FoyerProductBar />

      <FoyerProofStrip />

      <section className="foyer-product">
        <div>
          <p className="foyer-kicker">Our flagship platform</p>
          <h2>Insight.</h2>
          <p>
            One operational foundation for organizations that need their business to
            run better today and scale with confidence tomorrow.
          </p>
          <ul>
            <li>People, work, assets, and operational records in one platform</li>
            <li>Current visibility supported by historical context</li>
            <li>Industry-specific workflows without fragmenting the business</li>
            <li>Intelligence and automation built around real operations</li>
          </ul>
        </div>

        <aside className="foyer-product__placeholder">
          <span>One platform</span>
          <strong>Shared foundation · Operational modules · Connected intelligence</strong>
          <p>
            Insight adapts to the work an organization performs while preserving one
            source of operational truth.
          </p>
        </aside>
      </section>

      <section className="foyer-origin">
        <p className="foyer-kicker">Built from operational experience</p>
        <h2>Proven in the work. Designed to reach beyond it.</h2>
        <p>
          Insight was originally developed alongside FedEx Pickup &amp; Delivery
          operators working in a demanding, time-sensitive environment. That experience
          remains part of the platform&apos;s foundation—not a limit on where it can go.
        </p>
      </section>

      <section className="foyer-section foyer-modules">
        <p className="foyer-kicker">Operational modules</p>
        <h2>One platform shaped around the work you perform.</h2>
        <p className="foyer-section__lede">
          Operational modules extend Insight for specific lines of business while shared
          services such as people, scheduling, assets, reporting, permissions, and
          intelligence remain connected.
        </p>

        <div className="foyer-module-grid">
          {operationalModules.map((module) => (
            <article className="foyer-module" key={module.title}>
              <span>{module.eyebrow}</span>
              <h3>{module.title}</h3>
              <p>{module.body}</p>
              <strong>{module.status}</strong>
            </article>
          ))}
        </div>
      </section>

      <section className="foyer-section">
        <h2>Experience Team Optix and Insight.</h2>
        <div className="foyer-door-grid">
          {doors.map((door) => (
            <FoyerDoorCard key={door.href} {...door} />
          ))}
        </div>
      </section>

      <FoyerWorkspaceRequestCard />
    </main>
  );
}
