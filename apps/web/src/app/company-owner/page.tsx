import Image from "next/image";
import FoyerHeader from "@/features/foyer/components/FoyerHeader";
import FoyerConversationPreview from "@/features/foyer/components/FoyerConversationPreview";

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
          "Start the conversation",
          "We learn your operation",
          "Choose two priorities",
          "See the right Insight paths",
          "Plan your first 30 days",
        ].map((step, index) => (
          <article key={step}>
            <span>{index + 1}</span>
            <h3>{step}</h3>
          </article>
        ))}
      </section>

      <FoyerConversationPreview />
    </main>
  );
}
