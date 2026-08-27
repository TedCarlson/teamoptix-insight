import type { ReactNode } from "react";
import FoyerFooter from "@/features/foyer/components/FoyerFooter";
import FoyerHeader from "@/features/foyer/components/FoyerHeader";

type PublicInformationPageProps = {
  eyebrow: string;
  title: string;
  summary: string;
  updated: string;
  children: ReactNode;
};

export default function PublicInformationPage({
  eyebrow,
  title,
  summary,
  updated,
  children,
}: PublicInformationPageProps) {
  return (
    <main className="brand-product-page public-information-page">
      <section className="public-information-hero">
        <FoyerHeader />
        <div className="public-information-hero__copy">
          <p className="brand-eyebrow"><span /> {eyebrow}</p>
          <h1>{title}</h1>
          <p>{summary}</p>
          <span>Last updated {updated}</span>
        </div>
      </section>

      <article className="public-information-content">
        {children}
      </article>

      <FoyerFooter />
    </main>
  );
}
