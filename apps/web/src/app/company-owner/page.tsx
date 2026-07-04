import FoyerCtaBand from "@/features/foyer/components/FoyerCtaBand";
import FoyerHeader from "@/features/foyer/components/FoyerHeader";
import FoyerConversationPreview from "@/features/foyer/components/FoyerConversationPreview";

export default function CompanyOwnerPage() {
  return (
    <main className="foyer-page foyer-page--light">
      <FoyerHeader />

      <section className="foyer-detail">
        <p className="foyer-kicker">Company owners</p>
        <h1>Let&apos;s build your workspace.</h1>
        <p>
          Insight is built for operators who carry the responsibility of routes, drivers,
          payroll, compliance, reports, and tomorrow&apos;s decisions.
        </p>
      </section>

      <section className="foyer-steps">
        {[
          "Schedule an introduction",
          "We learn your operation",
          "We configure your company",
          "Import workforce and routes",
          "Launch Insight with your leadership team",
        ].map((step, index) => (
          <article key={step}>
            <span>{index + 1}</span>
            <h3>{step}</h3>
          </article>
        ))}
      </section>

      <FoyerConversationPreview />

      <section className="foyer-form-placeholder">
        <p className="foyer-kicker">Request foundation</p>
        <h2>Lead request form will live here.</h2>
        <p>
          This will capture company name, owner contact, terminal, route count,
          employee count, current tools, and biggest operational challenge.
        </p>
      </section>

      <FoyerCtaBand />
    </main>
  );
}
