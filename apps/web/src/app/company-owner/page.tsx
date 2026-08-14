import Image from "next/image";
import FoyerFooter from "@/features/foyer/components/FoyerFooter";
import FoyerHeader from "@/features/foyer/components/FoyerHeader";
import FoyerWorkspaceRequestCard from "@/features/foyer/components/FoyerWorkspaceRequestCard";

export default function CompanyOwnerPage() {
  return (
    <main className="foyer-page foyer-page--light">
      <FoyerHeader />

      <section className="foyer-owner-hero">
        <div className="foyer-detail">
          <p className="foyer-kicker">Company owners</p>
          <h1>Before we build anything...</h1>

          <p>
            Every operation is different, but the responsibilities are familiar.
            Payroll. Planning. Service reports. Hiring. Scheduling. Maintenance.
            Some days it&apos;s all of them before lunch.
          </p>

          <p>
            <strong>
              Tell us about your operation. We&apos;ll start there.
            </strong>
          </p>
        </div>

        <aside className="foyer-owner-hero__visual" aria-label="Insight workspace concept">
          <Image
            src="/foyer/images/build-the-workspace.png"
            alt="Logistics terminal with Insight operational overlays"
            width={1200}
            height={675}
            priority
          />
        </aside>
      </section>

      <section className="foyer-steps">
        {[
          {
            title: "Tell us your story.",
            body: "Every operation has one.",
          },
          {
            title: "Show us your priorities.",
            body: "What’s keeping you from running even better?",
          },
          {
            title: "We’ll connect the dots.",
            body: "See how Insight fits your business—not someone else’s.",
          },
          {
            title: "Build your roadmap.",
            body: "Know exactly where you’d start.",
          },
          {
            title: "Move forward with confidence.",
            body: "Whether that’s next week or next season.",
          },
        ].map((step) => (
          <article key={step.title}>
            <h3>{step.title}</h3>
            <p>{step.body}</p>
          </article>
        ))}
      </section>

      <FoyerWorkspaceRequestCard />
      <FoyerFooter />
    </main>
  );
}
