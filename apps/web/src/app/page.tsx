import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Blocks, CircleCheck, Database, Fingerprint, Sparkles } from "lucide-react";
import FoyerFooter from "@/features/foyer/components/FoyerFooter";
import FoyerHeader from "@/features/foyer/components/FoyerHeader";
import FoyerWorkspaceRequestCard from "@/features/foyer/components/FoyerWorkspaceRequestCard";
import InsightAnalyticsPreview from "@/features/foyer/components/InsightAnalyticsPreview";
import InsightSystemPreview from "@/features/foyer/components/InsightSystemPreview";

export const metadata: Metadata = {
  title: "Operational software built by operators",
  description: "Team Optix builds Insight, the governed operating system connecting people, work, assets, and daily decisions for field organizations.",
};

const foundations = [
  { icon: Fingerprint, title: "One operational identity", body: "People, roles, access, and responsibility stay connected across the work." },
  { icon: Database, title: "One governed record", body: "Current activity and historical context contribute to the same source of truth." },
  { icon: Blocks, title: "Workflows that fit", body: "Industry-specific work can evolve without fragmenting the operating foundation." },
  { icon: Sparkles, title: "Intelligence with context", body: "Automation starts from operational evidence and keeps people in control." },
];

const pathways = [
  { kicker: "Evaluate the platform", title: "For operators", body: "See how Insight can connect the responsibilities that currently compete for your attention.", href: "/company-owner", cta: "Start with your operation" },
  { kicker: "Experience the workday", title: "For teams", body: "Explore the connected experience for schedules, communication, performance, and daily work.", href: "/teams", cta: "Choose your team path" },
  { kicker: "Continue your work", title: "For current users", body: "Enter your authorized Insight workspace and return to the operating picture that belongs to you.", href: "/sign-in", cta: "Sign in to Insight" },
];

export default function HomePage() {
  return (
    <main className="brand-home">
      <section id="foyer-hero" className="brand-hero">
        <Image
          className="brand-hero__image"
          src="/foyer/images/hero-terminal-bright.png"
          alt="Field operator at the beginning of an operational day"
          fill
          priority
          sizes="100vw"
        />
        <div className="brand-hero__veil" />
        <FoyerHeader />

        <div className="brand-hero__layout">
          <div className="brand-hero__copy">
            <p className="brand-eyebrow"><span /> Insight by Team Optix</p>
            <h1>See the operation.<br /><em>Run it better.</em></h1>
            <p className="brand-hero__lede">
              Insight connects people, schedules, routes, assets, records, and daily decisions in one governed operating system.
            </p>
            <div className="brand-action-row">
              <Link className="brand-button brand-button--primary" href="/insight">
                See Insight in action <ArrowRight aria-hidden="true" />
              </Link>
              <Link className="brand-button brand-button--ghost" href="/company-owner">
                Start with your operation
              </Link>
            </div>
            <div className="brand-hero__promise">
              <CircleCheck aria-hidden="true" />
              <span><strong>Built for Operators. By Operators.</strong> Shaped by real responsibility, not abstract process.</span>
            </div>
          </div>

          <div className="brand-hero__product">
            <InsightSystemPreview compact />
          </div>
        </div>

        <a className="brand-scroll-cue" href="#flagship"><span>Discover Team Optix</span><i /></a>
      </section>

      <section className="brand-intro" id="flagship">
        <div className="brand-section-heading">
          <p className="brand-eyebrow brand-eyebrow--dark"><span /> Team Optix</p>
          <h2>One company. One flagship operating system. A foundation built to grow.</h2>
        </div>
        <div className="brand-intro__statement">
          <p>
            Team Optix builds operational software for organizations responsible for people, work, assets, and real-world execution.
          </p>
          <Link href="/company">Why we build this way <ArrowRight aria-hidden="true" /></Link>
        </div>
      </section>

      <section className="brand-flagship">
        <div className="brand-flagship__copy">
          <p className="brand-overline">Our flagship product</p>
          <h2>Insight</h2>
          <p className="brand-display-copy">
            The operating picture behind a better-run day.
          </p>
          <p>
            Insight brings operational responsibilities into one connected system so leaders can see what is happening, understand why it matters, and move the right work forward.
          </p>
          <Link className="brand-text-link" href="/insight">Explore the product <ArrowRight aria-hidden="true" /></Link>
        </div>
        <InsightAnalyticsPreview />
      </section>

      <section className="brand-foundation" id="platform">
        <div className="brand-section-heading brand-section-heading--light">
          <p className="brand-eyebrow"><span /> Shared foundation</p>
          <h2>Specific to the work. Connected at the core.</h2>
          <p>Insight adapts to the operation without creating another set of disconnected tools.</p>
        </div>
        <div className="brand-foundation__grid">
          {foundations.map(({ icon: Icon, title, body }, index) => (
            <article key={title}>
              <div><Icon aria-hidden="true" /><span>0{index + 1}</span></div>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="brand-proof">
        <div>
          <p className="brand-eyebrow brand-eyebrow--dark"><span /> Proven in the work</p>
          <h2>Operational experience is the starting point—not the limit.</h2>
        </div>
        <div>
          <p>
            Insight was first developed alongside pickup and delivery operators working in a demanding, time-sensitive environment. That origin created a discipline around evidence, accountability, and respect for the people doing the work.
          </p>
          <p>
            The same foundation can support other field organizations without pretending that every industry works the same way.
          </p>
        </div>
      </section>

      <section className="brand-pathways" id="workflows">
        <div className="brand-section-heading">
          <p className="brand-eyebrow brand-eyebrow--dark"><span /> Find your way in</p>
          <h2>One front door. A clear path for every visitor.</h2>
        </div>
        <div className="brand-pathways__grid">
          {pathways.map((path, index) => (
            <Link key={path.href} href={path.href} className="brand-pathway-card">
              <div><span>0{index + 1}</span><ArrowRight aria-hidden="true" /></div>
              <p>{path.kicker}</p>
              <h3>{path.title}</h3>
              <p>{path.body}</p>
              <strong>{path.cta}</strong>
            </Link>
          ))}
        </div>
      </section>

      <div className="brand-request-wrap">
        <FoyerWorkspaceRequestCard
          kicker="A focused introduction"
          title="Start with your operation."
          intro="Tell us how the work runs today. We’ll use that context to prepare an introduction to Insight around your responsibilities—not someone else’s checklist."
          supportingText="No generic demo. No obligation to force the fit."
          buttonLabel="Request an Insight introduction"
        />
      </div>

      <FoyerFooter />
    </main>
  );
}
