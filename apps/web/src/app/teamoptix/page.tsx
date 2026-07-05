import { teamOptixAbout } from "@/features/foyer/content/teamoptix-about";
import FoyerHeader from "@/features/foyer/components/FoyerHeader";
import FoyerWorkspaceRequestCard from "@/features/foyer/components/FoyerWorkspaceRequestCard";

export default function TeamOptixAboutPage() {
  return (
    <main className="foyer-page foyer-page--light">
      <FoyerHeader />

      <div className="teamoptix-about-shell">
        <section className="foyer-detail teamoptix-about-hero">
          <p className="foyer-kicker">{teamOptixAbout.hero.kicker}</p>
          <h1>{teamOptixAbout.hero.title}</h1>
          {teamOptixAbout.hero.intro.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </section>

        <section className="teamoptix-about-story">
          {teamOptixAbout.sections.map((section) => (
            <article key={section.title}>
              <h2>{section.title}</h2>
              {section.quote ? <blockquote>{section.quote}</blockquote> : null}
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </article>
          ))}
        </section>

        <FoyerWorkspaceRequestCard />
      </div>
    </main>
  );
}
