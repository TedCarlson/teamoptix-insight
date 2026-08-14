import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Layers3, Network, ShieldCheck, Sparkles } from "lucide-react";
import FoyerFooter from "@/features/foyer/components/FoyerFooter";
import FoyerHeader from "@/features/foyer/components/FoyerHeader";
import FoyerWorkspaceRequestCard from "@/features/foyer/components/FoyerWorkspaceRequestCard";
import InsightSystemPreview from "@/features/foyer/components/InsightSystemPreview";
import InsightLivingSystem from "@/features/foyer/explore/InsightLivingSystem";

export const metadata: Metadata = {
  title: "Insight — The operating picture behind a better-run day",
  description: "See how Insight connects people, work, schedules, assets, records, and intelligence in one governed operating system.",
};

const day = [
  { time: "Before the day", title: "Know what is ready", body: "Bring staffing, schedule, fleet, and open obligations into one readiness picture." },
  { time: "As work begins", title: "Move from plan to execution", body: "Carry the operating plan into assignments, dispatch, and the first decisions of the day." },
  { time: "While work moves", title: "Surface what changed", body: "Turn new evidence into prioritized exceptions while the right response can still matter." },
  { time: "At closeout", title: "Preserve the operational record", body: "Connect outcomes, follow-up, timekeeping, and unresolved work without rebuilding the day by hand." },
  { time: "Tomorrow", title: "Start with context", body: "Use governed history to recognize patterns, improve planning, and make the next day more predictable." },
];

const workflowLayers = [
  { icon: Layers3, title: "Shared services", body: "People, permissions, reporting, records, and intelligence remain connected." },
  { icon: Network, title: "Operational workflows", body: "The platform adapts to the line of business and the work it actually performs." },
  { icon: ShieldCheck, title: "Governed access", body: "Each person enters through an authorized role, product, company, and workspace." },
  { icon: Sparkles, title: "Contextual intelligence", body: "Automation works from evidence and makes its operating context visible." },
];

export default function InsightPage() {
  return (
    <main className="brand-product-page">
      <section className="product-hero">
        <div className="product-hero__glow" />
        <FoyerHeader />
        <div className="product-hero__layout">
          <div className="product-hero__copy">
            <p className="brand-eyebrow"><span /> Insight by Team Optix</p>
            <h1>The operating picture behind <em>better-run days.</em></h1>
            <p>
              See what is ready. Understand what changed. Move the right work forward. Preserve the record that makes tomorrow smarter.
            </p>
            <div className="brand-action-row">
              <Link className="brand-button brand-button--primary" href="#day">Follow a day with Insight <ArrowRight aria-hidden="true" /></Link>
              <Link className="brand-button brand-button--ghost" href="/company-owner">Request an introduction</Link>
            </div>
          </div>
          <InsightSystemPreview />
        </div>
      </section>

      <section className="product-declaration">
        <p className="brand-overline">Not another point solution</p>
        <h2>Insight follows the operation—not a department.</h2>
        <p>
          Planning becomes execution. Execution becomes operational history. History becomes the context behind tomorrow’s decisions. Insight keeps that story connected.
        </p>
      </section>

      <section className="product-platform" id="platform">
        <InsightLivingSystem />
      </section>

      <section className="product-day" id="day">
        <div className="brand-section-heading brand-section-heading--light">
          <p className="brand-eyebrow"><span /> A day with Insight</p>
          <h2>One connected story from readiness to tomorrow.</h2>
        </div>
        <div className="product-day__timeline">
          {day.map((moment, index) => (
            <article key={moment.time}>
              <div className="product-day__marker"><span>0{index + 1}</span><i /></div>
              <p>{moment.time}</p>
              <h3>{moment.title}</h3>
              <p>{moment.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="product-workflows" id="workflows">
        <div className="product-workflows__visual">
          <Image src="/foyer/images/hero-terminal-sunrise.png" alt="An operator looking across a working terminal at sunrise" fill sizes="(max-width: 900px) 100vw, 48vw" />
          <div className="product-workflows__visual-copy">
            <span>Built from operational experience</span>
            <strong>The system meets the work where it happens.</strong>
          </div>
        </div>
        <div className="product-workflows__copy">
          <p className="brand-eyebrow brand-eyebrow--dark"><span /> Platform architecture</p>
          <h2>Shaped around the work. Connected underneath.</h2>
          <p>
            Operational modules can reflect a specific line of business while the services that create trust remain shared.
          </p>
          <div className="product-workflows__layers">
            {workflowLayers.map(({ icon: Icon, title, body }) => (
              <article key={title}>
                <Icon aria-hidden="true" />
                <div><h3>{title}</h3><p>{body}</p></div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="product-access">
        <div>
          <p className="brand-eyebrow"><span /> Product access</p>
          <h2>The public story ends where governed work begins.</h2>
        </div>
        <div className="product-access__paths">
          <Link href="/company-owner"><span>Evaluating Insight</span><strong>Start with your operation</strong><ArrowRight aria-hidden="true" /></Link>
          <Link href="/teams"><span>Part of a team</span><strong>Choose your experience</strong><ArrowRight aria-hidden="true" /></Link>
          <Link href="/sign-in"><span>Already authorized</span><strong>Enter your workspace</strong><ArrowRight aria-hidden="true" /></Link>
        </div>
      </section>

      <div className="brand-request-wrap brand-request-wrap--product">
        <FoyerWorkspaceRequestCard
          kicker="See the fit"
          title="Bring us the operation you actually run."
          intro="We’ll prepare a focused Insight introduction around your responsibilities, operating model, and the work that matters most."
          supportingText="The goal is clarity—not a generic software tour."
          buttonLabel="Request an Insight introduction"
        />
      </div>
      <FoyerFooter />
    </main>
  );
}
